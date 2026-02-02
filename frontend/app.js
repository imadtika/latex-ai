/**
 * Latexis - Complete Application
 * By TIKA Imad - ENSA
 * National School of Applied Sciences
 */

const API_URL = '';

// ============================================================================
// State Management
// ============================================================================

const state = {
    currentChat: null,
    chats: [],
    folders: [],
    sidebarOpen: true,
    currentLatexCode: '',
    currentFilename: '',
    userApiKey: localStorage.getItem('groq_api_key') || ''
};

// ============================================================================
// API Key Management
// ============================================================================

function getUserApiKey() {
    return state.userApiKey || localStorage.getItem('groq_api_key') || '';
}

function setUserApiKey(key) {
    state.userApiKey = key;
    if (key) {
        localStorage.setItem('groq_api_key', key);
    } else {
        localStorage.removeItem('groq_api_key');
    }
}

// ============================================================================
// Typing Animation Phrases
// ============================================================================

const phrases = [
    "What would you like to create?",
    "Need a professional CV?",
    "Working on your thesis?",
    "Let's build a report.",
    "Ready for a cover letter?",
    "Design your presentation.",
    "Transform text into LaTeX."
];

let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;

// ============================================================================
// Document Templates
// ============================================================================

const templates = {
    cv: 'Create a clean, professional single-column CV with: Contact Information, Professional Summary, Work Experience, Education, Skills, and Languages. Use a minimal design with clear section headers, good white space, and no icons or excessive colors.',
    pfe: 'Create a thesis/PFE cover page with university name, logo placeholder, department, thesis title, student name, supervisor, jury members, and submission date.',
    letter: 'Create a professional cover letter with sender info, date, recipient, introduction, skills highlights, and closing. Use formal business formatting.',
    report: 'Create a technical report with title page, abstract, table of contents, introduction, methodology, results, conclusion, and references.',
    presentation: 'Create a Beamer presentation with title slide, outline, 4 content slides with bullet points, conclusion, and Q&A slide. Use a modern theme.'
};

// ============================================================================
// DOM Elements Cache
// ============================================================================

let el = {};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', init);

function init() {
    // Clear old API key that might be causing rate limit issues
    const savedKey = localStorage.getItem('groq_api_key');
    if (savedKey && savedKey.includes('HVQxBIMU0tKHmVHS1RgB')) {
        localStorage.removeItem('groq_api_key');
        console.log('Cleared old API key from localStorage');
    }
    
    loadState();
    cacheElements();
    setupListeners();
    setupApiKeyModal();
    setupPromptGuideModal();
    startTyping();
    renderSidebar();
    
    // Initialize tool features
    initSummarizeFeature();
    initHighlightFeature();
    
    // Pill-shaped theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.onclick = function() {
            document.body.classList.toggle('light-theme');
            // Save preference
            localStorage.setItem('theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
        };
        
        // Restore saved theme preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
        }
    }
    
    // Voice button (top-right) logic
    const voiceBtnTop = document.getElementById('voiceBtnTop');
    if (voiceBtnTop) {
        let recognition, recognizing = false;
        voiceBtnTop.onclick = async function() {
            if (recognizing && recognition) {
                recognition.stop();
                return;
            }

            // Check secure context (HTTPS or localhost required)
            const secureError = getVoiceRecognitionError();
            if (secureError) {
                toast(secureError);
                return;
            }

            // Check browser support first
            let SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                toast('Speech recognition not supported. Please use Chrome or Edge.');
                return;
            }

            // Request microphone permission
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    await navigator.mediaDevices.getUserMedia({ audio: true });
                }
            } catch (e) {
                toast('Microphone permission denied. Please allow microphone access.');
                return;
            }

            // Initialize recognition
            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = getSpeechRecognitionLang();
            recognition.maxAlternatives = 3;

            recognizing = true;
            voiceBtnTop.classList.add('recording');
            toast('Listening...');

            recognition.onresult = function(event) {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        transcript += pickBestTranscript(event.results[i]) + ' ';
                    }
                }

                if (transcript.trim()) {
                    const input = document.getElementById('promptInput');
                    if (input) {
                        input.value = (input.value + ' ' + transcript).trim();
                        if (typeof autoResize === 'function') autoResize(input);
                    }
                }
            };

            recognition.onerror = function(e) {
                console.error('Speech recognition error:', e);
                recognizing = false;
                voiceBtnTop.classList.remove('recording');
                toast(getVoiceErrorMessage(e.error));
            };

            recognition.onend = function() {
                recognizing = false;
                voiceBtnTop.classList.remove('recording');
                if (recognition && recognizing) {
                    try { recognition.start(); } catch (err) {}
                }
            };

            try {
                recognition.start();
            } catch (e) {
                toast(getVoiceErrorMessage('start-failed'));
                recognizing = false;
                voiceBtnTop.classList.remove('recording');
            }
        };
    }
}

function cacheElements() {
    el = {
        // Sidebar
        sidebar: document.getElementById('sidebar'),
        sidebarLogo: document.getElementById('sidebarLogo'),
        openSidebar: document.getElementById('openSidebar'),
        closeSidebar: document.getElementById('closeSidebar'),
        newChatBtn: document.getElementById('newChatBtn'),
        newFolderBtn: document.getElementById('newFolderBtn'),
        searchInput: document.getElementById('searchInput'),
        foldersList: document.getElementById('foldersList'),
        chatsList: document.getElementById('chatsList'),
        starredList: document.getElementById('starredList'),
        folderCount: document.getElementById('folderCount'),
        chatCount: document.getElementById('chatCount'),
        starredCount: document.getElementById('starredCount'),
        
        // Screens
        welcomeScreen: document.getElementById('welcomeScreen'),
        chatScreen: document.getElementById('chatScreen'),
        chatMessages: document.getElementById('chatMessages'),
        chatTitle: document.getElementById('chatTitle'),
        
        // Inputs
        promptInput: document.getElementById('promptInput'),
        chatPromptInput: document.getElementById('chatPromptInput'),
        sendBtn: document.getElementById('sendBtn'),
        chatSendBtn: document.getElementById('chatSendBtn'),
        
        // Chat Header
        backBtn: document.getElementById('backBtn'),
        editTitleBtn: document.getElementById('editTitleBtn'),
        starChatBtn: document.getElementById('starChatBtn'),
        moveChatBtn: document.getElementById('moveChatBtn'),
        deleteChatBtn: document.getElementById('deleteChatBtn'),
        
        // Modals
        aboutBtn: document.getElementById('aboutBtn'),
        apiKeyBtn: document.getElementById('apiKeyBtn'),
        aboutModal: document.getElementById('aboutModal'),
        closeAboutModal: document.getElementById('closeAboutModal'),
        
        confirmModal: document.getElementById('confirmModal'),
        confirmTitle: document.getElementById('confirmTitle'),
        confirmMessage: document.getElementById('confirmMessage'),
        confirmCancel: document.getElementById('confirmCancel'),
        confirmOk: document.getElementById('confirmOk'),
        
        folderModal: document.getElementById('folderModal'),
        closeFolderModal: document.getElementById('closeFolderModal'),
        folderModalTitle: document.getElementById('folderModalTitle'),
        folderNameInput: document.getElementById('folderNameInput'),
        folderModalCancel: document.getElementById('folderModalCancel'),
        folderModalSave: document.getElementById('folderModalSave'),
        
        renameModal: document.getElementById('renameModal'),
        closeRenameModal: document.getElementById('closeRenameModal'),
        chatNameInput: document.getElementById('chatNameInput'),
        renameModalCancel: document.getElementById('renameModalCancel'),
        renameModalSave: document.getElementById('renameModalSave'),
        
        moveModal: document.getElementById('moveModal'),
        closeMoveModal: document.getElementById('closeMoveModal'),
        folderSelectList: document.getElementById('folderSelectList'),
        moveModalCancel: document.getElementById('moveModalCancel'),
        removeFromFolder: document.getElementById('removeFromFolder'),
        
        // Loading & Toast
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingText: document.getElementById('loadingText'),
        typingText: document.getElementById('typingText'),
        toastContainer: document.getElementById('toastContainer'),

        // Voice & Upload
        voiceBtn: document.getElementById('voiceBtn'),
        voiceBtnChat: document.getElementById('voiceBtnChat'),
        uploadBtn: document.getElementById('uploadBtn'),
        uploadBtnChat: document.getElementById('uploadBtnChat'),
        uploadArea: document.getElementById('uploadArea'),
        fileInput: document.getElementById('fileInput'),
        closeUploadModal: document.getElementById('closeUploadModal'),
        uploadProgress: document.getElementById('uploadProgress'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),

        // Preview Modal (legacy)
        previewFrame: document.getElementById('previewFrame'),
        closePreviewModal: document.getElementById('closePreviewModal'),

        // Split-Pane PDF Preview
        viewContainer: document.querySelector('.view-container'),
        pdfPreviewPanel: document.getElementById('pdfPreviewPanel'),
        pdfPreviewContent: document.getElementById('pdfPreviewContent'),
        downloadPdfBtn: document.getElementById('downloadPdfBtn'),
        printPdfBtn: document.getElementById('printPdfBtn'),
        closePdfPreview: document.getElementById('closePdfPreview'),

        // Logo
        logo: document.querySelector('.logo')
    };
}

// Store current PDF blob for download/print
let currentPdfBlob = null;
let currentPdfUrl = null;

// Voice recognition setup
let recognition = null, recognizing = false;

function getSpeechRecognitionLang() {
    const lang = (navigator.language || navigator.userLanguage || 'en-US').toLowerCase();
    const langMap = {
        'fr': 'fr-FR', 'fr-fr': 'fr-FR', 'fr-be': 'fr-FR', 'fr-ca': 'fr-FR',
        'ar': 'ar-SA', 'ar-sa': 'ar-SA', 'ar-ma': 'ar-MA', 'ar-eg': 'ar-EG', 'ar-dz': 'ar-MA',
        'en': 'en-US', 'en-us': 'en-US', 'en-gb': 'en-GB'
    };
    return langMap[lang] || langMap[lang.split('-')[0]] || 'en-US';
}

function pickBestTranscript(result) {
    if (!result || result.length === 0) return '';
    let best = result[0];
    for (let j = 1; j < result.length; j++) {
        const conf = result[j].confidence || 0;
        if (conf > (best.confidence || 0)) best = result[j];
    }
    return (best.transcript || '').trim();
}

function getVoiceRecognitionError() {
    if (!window.isSecureContext) {
        return 'Voice recognition requires HTTPS or localhost. Please use Chrome/Edge on localhost, or access the app via https://';
    }
    return null;
}

function getVoiceErrorMessage(errorCode) {
    switch (errorCode) {
        case 'network':
            return 'Voice recognition uses cloud servers. Requires: 1) HTTPS or localhost, 2) Stable internet. Try Chrome/Edge on localhost or deploy with HTTPS.';
        case 'not-allowed':
        case 'service-not-allowed':
            return 'Microphone access denied. Please allow microphone access in your browser settings.';
        case 'no-speech':
            return 'No speech detected. Try speaking again.';
        case 'aborted':
            return 'Voice recognition was stopped.';
        case 'audio-capture':
            return 'No microphone found. Please connect a microphone.';
        case 'start-failed':
            return 'Could not start voice recognition. Use Chrome/Edge on localhost or HTTPS.';
        default:
            return 'Voice recognition failed. Requires HTTPS or Chrome/Edge on localhost. ' + (errorCode ? errorCode : '');
    }
}

async function startVoiceInput(targetInput, btn, autoSend = false) {
    if (recognizing && recognition) { recognition.stop(); return; }

    // Check secure context (HTTPS or localhost required)
    const secureError = getVoiceRecognitionError();
    if (secureError) {
        toast(secureError);
        return;
    }

    let SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        toast('Speech recognition not supported. Please use Chrome or Edge.');
        return;
    }

    try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        }
    } catch (e) {
        toast('Microphone permission denied. Please allow microphone access.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = getSpeechRecognitionLang();
    recognition.maxAlternatives = 3;
    recognizing = true;
    btn.classList.add('recording');
    toast('Listening...');

    recognition.onresult = function(event) {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                transcript += pickBestTranscript(event.results[i]) + ' ';
            }
        }
        if (transcript.trim()) {
            targetInput.value = (targetInput.value + ' ' + transcript).trim();
            autoResize(targetInput);
            if (autoSend) {
                setTimeout(() => {
                    if (btn.id === 'voiceBtnChat') {
                        document.getElementById('chatSendBtn').click();
                    } else if (btn.id === 'voiceBtn') {
                        document.getElementById('sendBtn').click();
                    }
                }, 100);
            }
        }
    };

    recognition.onerror = function(e) {
        console.error('Speech recognition error:', e);
        recognizing = false;
        btn.classList.remove('recording');
        toast(getVoiceErrorMessage(e.error));
    };

    recognition.onend = function() {
        recognizing = false;
        btn.classList.remove('recording');
    };

    try {
        recognition.start();
    } catch (e) {
        toast(getVoiceErrorMessage('start-failed'));
        recognizing = false;
        btn.classList.remove('recording');
    }
}
// ============================================================================
// Event Listeners Setup
// ============================================================================

function setupListeners() {
    // Sidebar toggle
    el.closeSidebar.onclick = () => toggleSidebar(false);
    el.openSidebar.onclick = () => toggleSidebar(true);
    
    // Logo click - go to home
    el.sidebarLogo.onclick = newChat;
    
    // New chat and folder
    el.newChatBtn.onclick = newChat;
    el.newFolderBtn.onclick = openNewFolderModal;
    
    // Search
    el.searchInput.oninput = (e) => filterChats(e.target.value);
    
    // Send messages
    el.sendBtn.onclick = sendWelcomeMessage;
    el.promptInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendWelcomeMessage();
        }
    };
    
    el.chatSendBtn.onclick = sendChatMessage;
    el.chatPromptInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    };
    
    // Auto resize textareas
    el.promptInput.oninput = () => autoResize(el.promptInput);
    el.chatPromptInput.oninput = () => autoResize(el.chatPromptInput);
    
    // Template buttons
    document.querySelectorAll('[data-template]').forEach(btn => {
        btn.onclick = () => {
            const template = btn.dataset.template;
            if (templates[template]) {
                el.promptInput.value = templates[template];
                autoResize(el.promptInput);
                el.promptInput.focus();
            }
        };
    });
    // --- [Voice Input events: auto-send for chat] ---
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        if (el.voiceBtn) {
            el.voiceBtn.onclick = () => startVoiceInput(el.promptInput, el.voiceBtn, false);
        }
        if (el.voiceBtnChat) {
            el.voiceBtnChat.onclick = () => startVoiceInput(el.chatPromptInput, el.voiceBtnChat, true);
        }
    } else {
        el.voiceBtn && (el.voiceBtn.style.display = 'none');
        el.voiceBtnChat && (el.voiceBtnChat.style.display = 'none');
    }

    // --- [NEW: Upload events] ---
    el.uploadBtn && (el.uploadBtn.onclick = () => openModal('uploadModal'));
    el.uploadBtnChat && (el.uploadBtnChat.onclick = () => openModal('uploadModal'));

    if (el.uploadArea && el.fileInput) {
        el.uploadArea.onclick = () => el.fileInput.click();
        el.uploadArea.ondragover = e => {
            e.preventDefault();
            el.uploadArea.classList.add('drag-over');
        };
        el.uploadArea.ondragleave = e => el.uploadArea.classList.remove('drag-over');
        el.uploadArea.ondrop = e => {
            e.preventDefault();
            el.uploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files[0]);
        };
        el.fileInput.onchange = e => e.target.files.length && handleUpload(e.target.files[0]);
    }
    el.closeUploadModal && (el.closeUploadModal.onclick = () => closeModal('uploadModal'));

    // --- [Preview Modal events] ---
    el.closePreviewModal && (el.closePreviewModal.onclick = () => closeModal('previewModal'));

    // --- [Split-Pane PDF Preview events] ---
    el.closePdfPreview && (el.closePdfPreview.onclick = closePdfPreview);
    el.downloadPdfBtn && (el.downloadPdfBtn.onclick = downloadCurrentPdf);
    el.printPdfBtn && (el.printPdfBtn.onclick = printCurrentPdf);

    // --- [Logo navigation] ---
    el.logo && (el.logo.onclick = () => {
        closePdfPreview(); // Close preview when navigating home
        goHome();
        state.currentChat = null;
        el.chatMessages.innerHTML = '';
        el.promptInput.value = '';
        el.chatPromptInput.value = '';
        renderSidebar();
    });
    
    // Chat header actions
    el.backBtn.onclick = () => {
        closePdfPreview(); // Close preview when going back
        goHome();
    };
    el.editTitleBtn.onclick = openRenameModal;
    el.starChatBtn.onclick = toggleStar;
    el.moveChatBtn.onclick = openMoveModal;
    el.deleteChatBtn.onclick = confirmDeleteChat;
    
    // About modal
    el.aboutBtn.onclick = () => openModal('aboutModal');
    el.closeAboutModal.onclick = () => closeModal('aboutModal');
    
    // API Key button
    if (el.apiKeyBtn) {
        el.apiKeyBtn.onclick = () => showApiKeyModal();
    }
    
    // Confirm modal
    el.confirmCancel.onclick = () => closeModal('confirmModal');
    
    // Folder modal
    el.closeFolderModal.onclick = () => closeModal('folderModal');
    el.folderModalCancel.onclick = () => closeModal('folderModal');
    
    // Rename modal
    el.closeRenameModal.onclick = () => closeModal('renameModal');
    el.renameModalCancel.onclick = () => closeModal('renameModal');
    el.renameModalSave.onclick = saveRename;
    
    // Move modal
    el.closeMoveModal.onclick = () => closeModal('moveModal');
    el.moveModalCancel.onclick = () => closeModal('moveModal');
    el.removeFromFolder.onclick = removeChatFromFolder;
    
    // Close modals on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        };
    });
    
    // Close modals on Escape key
    document.onkeydown = (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => {
                m.classList.remove('active');
            });
        }
    };
}

// ============================================================================
// Sidebar Functions
// ============================================================================

function toggleSidebar(open) {
    state.sidebarOpen = open;
    if (open) {
        el.sidebar.classList.remove('closed');
        el.openSidebar.classList.remove('show');
    } else {
        el.sidebar.classList.add('closed');
        el.openSidebar.classList.add('show');
    }
}

// ============================================================================
// Typing Animation
// ============================================================================

function startTyping() {
    typeNextChar();
}

function typeNextChar() {
    const currentPhrase = phrases[phraseIndex];
    
    if (isDeleting) {
        el.typingText.textContent = currentPhrase.substring(0, charIndex - 1);
        charIndex--;
    } else {
        el.typingText.textContent = currentPhrase.substring(0, charIndex + 1);
        charIndex++;
    }
    
    let speed = isDeleting ? 30 : 70;
    
    if (!isDeleting && charIndex === currentPhrase.length) {
        speed = 2000;
        isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        speed = 500;
    }
    
    setTimeout(typeNextChar, speed);
}

// ============================================================================
// Textarea Auto Resize (Disabled - Fixed Size)
// ============================================================================

function autoResize(textarea) {
    // Reset height to measure actual content
    textarea.style.height = 'auto';
    
    // Calculate new height based on scroll height
    const minHeight = 24;
    const maxHeight = 160;
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    
    textarea.style.height = newHeight + 'px';
    
    // Show scrollbar only when content exceeds max height
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function resetInputSize(textarea) {
    // Clear value and reset to minimum height
    textarea.value = '';
    textarea.style.height = '24px';
    textarea.style.overflowY = 'hidden';
}

// ============================================================================
// State Persistence
// ============================================================================

function loadState() {
    try {
        const saved = localStorage.getItem('latexAIState');
        if (saved) {
            const data = JSON.parse(saved);
            state.chats = data.chats || [];
            state.folders = data.folders || [];
        }
    } catch (e) {
        console.error('Failed to load state:', e);
    }
}

function saveState() {
    try {
        localStorage.setItem('latexAIState', JSON.stringify({
            chats: state.chats,
            folders: state.folders
        }));
    } catch (e) {
        console.error('Failed to save state:', e);
    }
}

// ============================================================================
// Sidebar Rendering
// ============================================================================

function renderSidebar() {
    renderFolders();
    renderChats();
    renderStarred();
}

function renderFolders() {
    el.folderCount.textContent = state.folders.length;
    
    if (state.folders.length === 0) {
        el.foldersList.innerHTML = `
            <div class="empty-state">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>No folders yet</span>
            </div>`;
        return;
    }
    
    el.foldersList.innerHTML = state.folders.map(folder => {
        const chatsInFolder = state.chats.filter(c => c.folderId === folder.id);
        return `
            <div class="folder-item" data-id="${folder.id}">
                <div class="folder-header" onclick="toggleFolder('${folder.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 18l6-6-6-6"/>
                    </svg>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span class="folder-name">${escapeHtml(folder.name)}</span>
                    <span class="folder-count">${chatsInFolder.length}</span>
                    <div class="folder-actions">
                        <button class="folder-action-btn" onclick="event.stopPropagation(); editFolder('${folder.id}')" title="Rename">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="folder-action-btn danger" onclick="event.stopPropagation(); deleteFolder('${folder.id}')" title="Delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="folder-chats" id="folder-chats-${folder.id}">
                    ${chatsInFolder.map(chat => `
                        <div class="chat-item ${chat.starred ? 'starred' : ''} ${state.currentChat?.id === chat.id ? 'active' : ''}" onclick="loadChat('${chat.id}')">
                            <span class="chat-dot"></span>
                            <span class="chat-item-name">${escapeHtml(chat.name)}</span>
                            <button class="chat-menu-btn" onclick="event.stopPropagation(); toggleChatMenu('${chat.id}')" title="More options">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="5" r="2"/>
                                    <circle cx="12" cy="12" r="2"/>
                                    <circle cx="12" cy="19" r="2"/>
                                </svg>
                            </button>
                            <div class="chat-dropdown-menu" id="chat-menu-${chat.id}">
                                <button class="chat-dropdown-item" onclick="event.stopPropagation(); renameChat('${chat.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                    <span>Rename</span>
                                </button>
                                <button class="chat-dropdown-item" onclick="event.stopPropagation(); toggleStar('${chat.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                    </svg>
                                    <span>${chat.starred ? 'Unstar' : 'Star'}</span>
                                </button>
                                <button class="chat-dropdown-item" onclick="event.stopPropagation(); removeFromFolder('${chat.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                        <line x1="9" y1="14" x2="15" y2="14"/>
                                    </svg>
                                    <span>Remove from Folder</span>
                                </button>
                                <div class="chat-dropdown-divider"></div>
                                <button class="chat-dropdown-item danger" onclick="event.stopPropagation(); deleteChat('${chat.id}')">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"/>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    </svg>
                                    <span>Delete</span>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }).join('');
}

function renderChats() {
    const unfolderedChats = state.chats.filter(c => !c.folderId && !c.starred);
    el.chatCount.textContent = unfolderedChats.length;
    
    if (unfolderedChats.length === 0) {
        el.chatsList.innerHTML = `
            <div class="empty-state">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span>No chats yet</span>
            </div>`;
        return;
    }
    
    el.chatsList.innerHTML = unfolderedChats.map(chat => `
        <div class="chat-item ${state.currentChat?.id === chat.id ? 'active' : ''}" onclick="loadChat('${chat.id}')">
            <span class="chat-dot"></span>
            <span class="chat-item-name">${escapeHtml(chat.name)}</span>
            <button class="chat-menu-btn" onclick="event.stopPropagation(); toggleChatMenu('${chat.id}')" title="More options">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                </svg>
            </button>
            <div class="chat-dropdown-menu" id="chat-menu-${chat.id}">
                <button class="chat-dropdown-item" onclick="event.stopPropagation(); renameChat('${chat.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    <span>Rename</span>
                </button>
                <button class="chat-dropdown-item" onclick="event.stopPropagation(); toggleStar('${chat.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    <span>${chat.starred ? 'Unstar' : 'Star'}</span>
                </button>
                <button class="chat-dropdown-item" onclick="event.stopPropagation(); showAddToFolderModal('${chat.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span>Add to Folder</span>
                </button>
                <div class="chat-dropdown-divider"></div>
                <button class="chat-dropdown-item danger" onclick="event.stopPropagation(); deleteChat('${chat.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    <span>Delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

function renderStarred() {
    const starredChats = state.chats.filter(c => c.starred);
    el.starredCount.textContent = starredChats.length;
    
    if (starredChats.length === 0) {
        el.starredList.innerHTML = `
            <div class="empty-state">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span>No starred chats</span>
            </div>`;
        return;
    }
    
    el.starredList.innerHTML = starredChats.map(chat => `
        <div class="chat-item starred ${state.currentChat?.id === chat.id ? 'active' : ''}" onclick="loadChat('${chat.id}')">
            <span class="chat-dot"></span>
            <span class="chat-item-name">${escapeHtml(chat.name)}</span>
            <button class="chat-menu-btn" onclick="event.stopPropagation(); toggleChatMenu('${chat.id}')" title="More options">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="12" cy="19" r="2"/>
                </svg>
            </button>
            <div class="chat-dropdown-menu" id="chat-menu-${chat.id}">
                <button class="chat-dropdown-item" onclick="event.stopPropagation(); renameChat('${chat.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    <span>Rename</span>
                </button>
                <button class="chat-dropdown-item" onclick="event.stopPropagation(); toggleStar('${chat.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    <span>Unstar</span>
                </button>
                <button class="chat-dropdown-item" onclick="event.stopPropagation(); showAddToFolderModal('${chat.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span>Add to Folder</span>
                </button>
                <div class="chat-dropdown-divider"></div>
                <button class="chat-dropdown-item danger" onclick="event.stopPropagation(); deleteChat('${chat.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    <span>Delete</span>
                </button>
            </div>
        </div>
    `).join('');
}

// ============================================================================
// Folder Functions
// ============================================================================

function toggleFolder(folderId) {
    const folderItem = document.querySelector(`[data-id="${folderId}"]`);
    if (!folderItem) return;
    
    const header = folderItem.querySelector('.folder-header');
    const chatsDiv = document.getElementById(`folder-chats-${folderId}`);
    
    if (header && chatsDiv) {
        header.classList.toggle('expanded');
        chatsDiv.classList.toggle('expanded');
    }
}

function openNewFolderModal() {
    el.folderModalTitle.textContent = 'New Folder';
    el.folderNameInput.value = '';
    el.folderModalSave.textContent = 'Create';
    el.folderModalSave.onclick = createFolder;
    openModal('folderModal');
    setTimeout(() => el.folderNameInput.focus(), 100);
}

function createFolder() {
    const name = el.folderNameInput.value.trim();
    if (!name) {
        toast('Please enter a folder name');
        return;
    }
    
    const folder = {
        id: generateId(),
        name: name,
        createdAt: Date.now()
    };
    
    state.folders.push(folder);
    saveState();
    renderSidebar();
    closeModal('folderModal');
    toast('Folder created');
}

function editFolder(folderId) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return;
    
    el.folderModalTitle.textContent = 'Rename Folder';
    el.folderNameInput.value = folder.name;
    el.folderModalSave.textContent = 'Save';
    el.folderModalSave.onclick = () => {
        const newName = el.folderNameInput.value.trim();
        if (!newName) {
            toast('Please enter a folder name');
            return;
        }
        folder.name = newName;
        saveState();
        renderSidebar();
        closeModal('folderModal');
        toast('Folder renamed');
    };
    openModal('folderModal');
    setTimeout(() => el.folderNameInput.focus(), 100);
}

function deleteFolder(folderId) {
    el.confirmTitle.textContent = 'Delete Folder';
    el.confirmMessage.textContent = 'Are you sure? Chats inside will be moved out of the folder.';
    el.confirmOk.onclick = () => {
        state.chats.forEach(chat => {
            if (chat.folderId === folderId) {
                chat.folderId = null;
            }
        });
        state.folders = state.folders.filter(f => f.id !== folderId);
        saveState();
        renderSidebar();
        closeModal('confirmModal');
        toast('Folder deleted');
    };
    openModal('confirmModal');
}

// ============================================================================
// Chat Functions
// ============================================================================

function newChat() {
    closePdfPreview(); // Close preview when creating new chat
    state.currentChat = null;
    state.currentLatexCode = '';
    state.currentFilename = '';
    el.chatMessages.innerHTML = '';
    goHome();
    el.promptInput.value = '';
    el.promptInput.focus();
    renderSidebar();
}

function sendWelcomeMessage() {
    const prompt = el.promptInput.value.trim();
    if (!prompt) return;
    
    const title = generateChatTitle(prompt);
    
    const chat = {
        id: generateId(),
        name: title,
        messages: [],
        starred: false,
        folderId: null,
        createdAt: Date.now()
    };
    
    state.chats.unshift(chat);
    state.currentChat = chat;
    saveState();
    renderSidebar();
    
    showChatScreen();
    addUserMessage(prompt);
    el.promptInput.value = '';
    autoResize(el.promptInput);
    
    generateLatex(prompt);
}

function sendChatMessage() {
    const prompt = el.chatPromptInput.value.trim();
    if (!prompt || !state.currentChat) return;
    
    addUserMessage(prompt);
    el.chatPromptInput.value = '';
    autoResize(el.chatPromptInput);
    
    generateLatex(prompt);
}

function generateChatTitle(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('cv') || lowerPrompt.includes('resume') || lowerPrompt.includes('curriculum')) {
        return 'CV - ' + extractKeyInfo(prompt);
    } else if (lowerPrompt.includes('thesis') || lowerPrompt.includes('pfe') || lowerPrompt.includes('dissertation') || lowerPrompt.includes('memoir')) {
        return 'Thesis - ' + extractKeyInfo(prompt);
    } else if (lowerPrompt.includes('letter') || lowerPrompt.includes('cover letter') || lowerPrompt.includes('motivation')) {
        return 'Letter - ' + extractKeyInfo(prompt);
    } else if (lowerPrompt.includes('report') || lowerPrompt.includes('technical') || lowerPrompt.includes('internship')) {
        return 'Report - ' + extractKeyInfo(prompt);
    } else if (lowerPrompt.includes('presentation') || lowerPrompt.includes('slides') || lowerPrompt.includes('beamer')) {
        return 'Slides - ' + extractKeyInfo(prompt);
    } else if (lowerPrompt.includes('article') || lowerPrompt.includes('paper') || lowerPrompt.includes('journal')) {
        return 'Article - ' + extractKeyInfo(prompt);
    } else if (lowerPrompt.includes('invoice') || lowerPrompt.includes('facture')) {
        return 'Invoice - ' + extractKeyInfo(prompt);
    } else {
        const words = prompt.split(' ').slice(0, 6).join(' ');
        return words.length > 35 ? words.substring(0, 35) + '...' : words;
    }
}

function extractKeyInfo(prompt) {
    const stopWords = ['create', 'make', 'generate', 'professional', 'with', 'for', 'the', 'and', 'a', 'an', 'please', 'i', 'want', 'need', 'would', 'like'];
    const words = prompt.split(/\s+/);
    const keywords = words.filter(w => 
        w.length > 2 && 
        !stopWords.includes(w.toLowerCase())
    ).slice(0, 4);
    
    const info = keywords.join(' ');
    return info.length > 25 ? info.substring(0, 25) + '...' : (info || 'Document');
}

function loadChat(chatId) {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    
    closePdfPreview(); // Close preview when switching chats
    
    state.currentChat = chat;
    state.currentLatexCode = '';
    state.currentFilename = '';
    
    showChatScreen();
    
    el.chatMessages.innerHTML = '';
    chat.messages.forEach(msg => {
        if (msg.role === 'user') {
            addUserMessage(msg.content, false);
        } else {
            addAssistantMessage(msg.content, msg.code, false);
            if (msg.code) {
                state.currentLatexCode = msg.code;
            }
        }
    });
    
    updateStarButton();
    el.chatTitle.textContent = chat.name;
    renderSidebar();
}

function showChatScreen() {
    el.welcomeScreen.style.visibility = 'hidden';
    el.welcomeScreen.style.pointerEvents = 'none';
    el.chatScreen.classList.add('active');
    el.chatScreen.style.visibility = '';
    el.chatScreen.style.pointerEvents = '';
    
    // Reset chat input to default size
    if (el.chatPromptInput) {
        el.chatPromptInput.value = '';
        el.chatPromptInput.style.height = 'auto';
    }
    
    if (state.currentChat) {
        el.chatTitle.textContent = state.currentChat.name;
        updateStarButton();
    }
}

function goHome() {
    hideLoading();
    el.chatScreen.classList.remove('active');
    el.chatScreen.style.visibility = 'hidden';
    el.chatScreen.style.pointerEvents = 'none';
    el.welcomeScreen.style.visibility = 'visible';
    el.welcomeScreen.style.pointerEvents = 'auto';
    state.currentChat = null;
    renderSidebar();
    if (el.chatPromptInput) el.chatPromptInput.blur();
    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        promptInput.removeAttribute('disabled');
        promptInput.removeAttribute('readonly');
        promptInput.style.pointerEvents = '';
        setTimeout(function () {
            promptInput.focus();
        }, 50);
    }
}

// ============================================================================
// Message Functions
// ============================================================================

function addUserMessage(text, save = true) {
    const div = document.createElement('div');
    div.className = 'message message-user';
    div.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
    el.chatMessages.appendChild(div);
    scrollToBottom();
    
    if (save && state.currentChat) {
        state.currentChat.messages.push({ role: 'user', content: text });
        saveState();
    }
}

function addAssistantMessage(text, code = null, save = true) {
    const div = document.createElement('div');
    div.className = 'message message-assistant';
    
    let codeHtml = '';
    if (code) {
        state.currentLatexCode = code;
        const codeId = 'latex-editor-' + Date.now();
        codeHtml = `
            <div class="code-block">
                <div class="code-header">
                    <span class="code-lang">LaTeX</span>
                    <div class="code-actions">
                        <button class="code-btn edit-toggle" onclick="toggleEditMode('${codeId}', this)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Edit
                        </button>
                        <button class="code-btn preview" onclick="previewPDF()">Preview</button>
                        <button class="code-btn" onclick="copyCode()">Copy</button>
                        <button class="code-btn" onclick="downloadTex()">Download .tex</button>
                        <button class="code-btn primary" onclick="openOverleaf()">Open in Overleaf</button>
                    </div>
                </div>
                <div class="code-content">
                    <pre id="${codeId}" class="latex-code-display">${escapeHtml(code)}</pre>
                    <textarea id="${codeId}-editor" class="latex-code-editor hidden" spellcheck="false">${escapeHtml(code)}</textarea>
                </div>
            </div>`;
    }
    
    div.innerHTML = `
        <div class="message-header">
            <div class="assistant-avatar">
                <img src="LTX.png" alt="AI">
            </div>
            <span class="assistant-name">Latexis</span>
        </div>
        <div class="message-body">
            <div class="message-text">${text}</div>
            ${codeHtml}
        </div>`;
    
    el.chatMessages.appendChild(div);
    scrollToBottom();
    
    if (save && state.currentChat) {
        state.currentChat.messages.push({ role: 'assistant', content: text, code: code });
        saveState();
    }
}

// Toggle edit mode for LaTeX code
window.toggleEditMode = function(codeId, btn) {
    const display = document.getElementById(codeId);
    const editor = document.getElementById(codeId + '-editor');
    
    if (!display || !editor) return;
    
    const isEditing = !editor.classList.contains('hidden');
    
    if (isEditing) {
        // Save changes and switch to display mode
        const newCode = editor.value;
        state.currentLatexCode = newCode;
        display.textContent = newCode;
        display.classList.remove('hidden');
        editor.classList.add('hidden');
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit`;
        btn.classList.remove('active');
        toast('Changes saved');
        
        // Update in chat history
        if (state.currentChat) {
            const lastAssistantMsg = [...state.currentChat.messages].reverse().find(m => m.role === 'assistant' && m.code);
            if (lastAssistantMsg) {
                lastAssistantMsg.code = newCode;
                saveState();
            }
        }
    } else {
        // Switch to edit mode
        editor.value = state.currentLatexCode;
        display.classList.add('hidden');
        editor.classList.remove('hidden');
        editor.focus();
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            Save`;
        btn.classList.add('active');
    }
};

function addErrorMessage(text) {
    const div = document.createElement('div');
    div.className = 'message message-assistant';
    div.innerHTML = `
        <div class="message-header">
            <div class="assistant-avatar">
                <img src="LTX.png" alt="AI">
            </div>
            <span class="assistant-name">Latexis</span>
        </div>
        <div class="message-body">
            <div class="message-error">${escapeHtml(text)}</div>
        </div>`;
    el.chatMessages.appendChild(div);
    scrollToBottom();
}

// ============================================================================
// API Functions
// ============================================================================

async function generateLatex(prompt) {
    showLoading('Generating LaTeX code...');
    
    try {
        const requestBody = { prompt };
        const apiKey = getUserApiKey();
        if (apiKey) {
            requestBody.api_key = apiKey;
        }
        
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.currentFilename = data.filename;
            state.currentLatexCode = data.latex_code;
            addAssistantMessage(
                'Your LaTeX document is ready! You can copy the code, download as .tex file, or open directly in Overleaf to compile and get your PDF.',
                data.latex_code
            );
        } else if (data.rate_limited) {
            // Show API key prompt when rate limited
            showApiKeyModal(data.error);
        } else {
            addErrorMessage('Error: ' + data.error);
        }
    } catch (error) {
        addErrorMessage('Cannot connect to server. Make sure the backend is running on ' + API_URL);
        console.error('API Error:', error);
    } finally {
        hideLoading();
    }
}

// ============================================================================
// Code Action Functions
// ============================================================================

function copyCode() {
    if (!state.currentLatexCode) {
        toast('No code to copy');
        return;
    }
    
    navigator.clipboard.writeText(state.currentLatexCode).then(() => {
        toast('Code copied to clipboard');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = state.currentLatexCode;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        toast('Code copied to clipboard');
    });
}

function downloadTex() {
    if (!state.currentLatexCode) {
        toast('No code to download');
        return;
    }
    
    const blob = new Blob([state.currentLatexCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (state.currentFilename || 'document') + '.tex';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('File downloaded');
}

function openOverleaf() {
    if (!state.currentLatexCode) {
        toast('No code to open');
        return;
    }
    
    try {
        const encoded = btoa(unescape(encodeURIComponent(state.currentLatexCode)));
        const url = `https://www.overleaf.com/docs?snip_uri=data:text/plain;base64,${encoded}`;
        window.open(url, '_blank');
        toast('Opening Overleaf...');
    } catch (e) {
        copyCode();
        window.open('https://www.overleaf.com/project', '_blank');
        toast('Code copied. Paste it in Overleaf.');
    }
}

// ============================================================================
// Chat Header Action Functions
// ============================================================================

function openRenameModal() {
    if (!state.currentChat) return;
    
    el.chatNameInput.value = state.currentChat.name;
    openModal('renameModal');
    setTimeout(() => el.chatNameInput.focus(), 100);
}

function saveRename() {
    if (!state.currentChat) return;
    
    const newName = el.chatNameInput.value.trim();
    if (!newName) {
        toast('Please enter a name');
        return;
    }
    
    state.currentChat.name = newName;
    el.chatTitle.textContent = newName;
    saveState();
    renderSidebar();
    closeModal('renameModal');
    toast('Chat renamed');
}

function updateStarButton() {
    if (state.currentChat?.starred) {
        el.starChatBtn.classList.add('active');
    } else {
        el.starChatBtn.classList.remove('active');
    }
}

function openMoveModal() {
    if (!state.currentChat) return;
    
    if (state.folders.length === 0) {
        el.folderSelectList.innerHTML = '<div class="no-folders-msg">No folders available. Create one first.</div>';
    } else {
        el.folderSelectList.innerHTML = state.folders.map(folder => `
            <div class="folder-select-item ${state.currentChat.folderId === folder.id ? 'selected' : ''}" onclick="moveChatToFolder('${folder.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>${escapeHtml(folder.name)}</span>
            </div>
        `).join('');
    }
    
    openModal('moveModal');
}

function moveChatToFolder(folderId) {
    if (!state.currentChat) return;
    
    state.currentChat.folderId = folderId;
    saveState();
    renderSidebar();
    closeModal('moveModal');
    toast('Chat moved to folder');
}

function removeChatFromFolder() {
    if (!state.currentChat) return;
    
    state.currentChat.folderId = null;
    saveState();
    renderSidebar();
    closeModal('moveModal');
    toast('Chat removed from folder');
}

// ============================================================================
// Chat Dropdown Menu Functions
// ============================================================================

let activeMenuId = null;

function toggleChatMenu(chatId) {
    // Close any open menu
    closeAllChatMenus();
    
    const menu = document.getElementById(`chat-menu-${chatId}`);
    if (menu) {
        menu.classList.add('show');
        activeMenuId = chatId;
    }
}

function closeAllChatMenus() {
    document.querySelectorAll('.chat-dropdown-menu.show').forEach(menu => {
        menu.classList.remove('show');
    });
    activeMenuId = null;
}

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-menu-btn') && !e.target.closest('.chat-dropdown-menu')) {
        closeAllChatMenus();
    }
});

function renameChat(chatId) {
    closeAllChatMenus();
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    
    el.renameInput.value = chat.name;
    el.confirmRename.onclick = () => {
        const newName = el.renameInput.value.trim() || 'Untitled';
        chat.name = newName;
        if (state.currentChat?.id === chatId) {
            el.chatTitle.textContent = newName;
        }
        saveState();
        renderSidebar();
        closeModal('renameModal');
        toast('Chat renamed');
    };
    openModal('renameModal');
}

function deleteChat(chatId) {
    closeAllChatMenus();
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    
    el.confirmTitle.textContent = 'Delete Chat';
    el.confirmMessage.textContent = `Are you sure you want to delete "${chat.name}"? This cannot be undone.`;
    el.confirmOk.onclick = () => {
        state.chats = state.chats.filter(c => c.id !== chatId);
        if (state.currentChat?.id === chatId) {
            state.currentChat = null;
            state.currentLatexCode = '';
            state.currentFilename = '';
            goHome();
        }
        saveState();
        renderSidebar();
        closeModal('confirmModal');
        toast('Chat deleted');
    };
    openModal('confirmModal');
}

function toggleStar(chatId) {
    closeAllChatMenus();
    
    // If chatId is provided, toggle that chat's star
    if (chatId) {
        const chat = state.chats.find(c => c.id === chatId);
        if (chat) {
            chat.starred = !chat.starred;
            saveState();
            renderSidebar();
            toast(chat.starred ? 'Chat starred' : 'Star removed');
            
            // Update button if it's the current chat
            if (state.currentChat?.id === chatId) {
                updateStarButton();
            }
        }
        return;
    }
    
    // Legacy: toggle current chat's star
    if (!state.currentChat) return;
    state.currentChat.starred = !state.currentChat.starred;
    updateStarButton();
    saveState();
    renderSidebar();
    toast(state.currentChat.starred ? 'Chat starred' : 'Star removed');
}

function showAddToFolderModal(chatId) {
    closeAllChatMenus();
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    
    if (state.folders.length === 0) {
        el.folderSelectList.innerHTML = '<div class="no-folders-msg">No folders available. Create one first.</div>';
    } else {
        el.folderSelectList.innerHTML = state.folders.map(folder => `
            <div class="folder-select-item ${chat.folderId === folder.id ? 'selected' : ''}" onclick="addChatToFolder('${chatId}', '${folder.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>${escapeHtml(folder.name)}</span>
            </div>
        `).join('');
    }
    
    openModal('moveModal');
}

function addChatToFolder(chatId, folderId) {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    
    chat.folderId = folderId;
    saveState();
    renderSidebar();
    closeModal('moveModal');
    toast('Chat added to folder');
}

function removeFromFolder(chatId) {
    closeAllChatMenus();
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) return;
    
    chat.folderId = null;
    saveState();
    renderSidebar();
    toast('Chat removed from folder');
}

function confirmDeleteChat() {
    if (!state.currentChat) return;
    
    el.confirmTitle.textContent = 'Delete Chat';
    el.confirmMessage.textContent = 'Are you sure you want to delete this chat? This cannot be undone.';
    el.confirmOk.onclick = () => {
        state.chats = state.chats.filter(c => c.id !== state.currentChat.id);
        state.currentChat = null;
        state.currentLatexCode = '';
        state.currentFilename = '';
        saveState();
        renderSidebar();
        goHome();
        closeModal('confirmModal');
        toast('Chat deleted');
    };
    openModal('confirmModal');
}

// ============================================================================
// Search Function
// ============================================================================

function filterChats(query) {
    const q = query.toLowerCase().trim();
    
    document.querySelectorAll('.chat-item').forEach(item => {
        const name = item.querySelector('.chat-item-name');
        if (name) {
            const text = name.textContent.toLowerCase();
            item.style.display = (q === '' || text.includes(q)) ? 'flex' : 'none';
        }
    });
    
    document.querySelectorAll('.folder-item').forEach(folder => {
        const folderName = folder.querySelector('.folder-name');
        const chatsInFolder = folder.querySelectorAll('.chat-item');
        
        let hasVisibleChat = false;
        chatsInFolder.forEach(chat => {
            if (chat.style.display !== 'none') {
                hasVisibleChat = true;
            }
        });
        
        const folderNameMatch = folderName && folderName.textContent.toLowerCase().includes(q);
        folder.style.display = (q === '' || folderNameMatch || hasVisibleChat) ? 'block' : 'none';
    });
}

// ============================================================================
// Modal Functions
// ============================================================================

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
    }
}

// ============================================================================
// API Key Modal Functions
// ============================================================================

function showApiKeyModal(message = null) {
    const messageEl = document.getElementById('apiKeyMessage');
    const inputEl = document.getElementById('apiKeyInput');
    const statusEl = document.getElementById('apiKeyStatus');
    
    if (message) {
        messageEl.textContent = message;
    } else {
        messageEl.textContent = "Add your own Groq API key to get unlimited access to Latexis.";
    }
    
    // Pre-fill with existing key if available
    const existingKey = getUserApiKey();
    if (existingKey) {
        inputEl.value = existingKey;
    } else {
        inputEl.value = '';
    }
    
    statusEl.textContent = '';
    statusEl.className = 'api-key-status';
    
    openModal('apiKeyModal');
}

function setupApiKeyModal() {
    const closeBtn = document.getElementById('closeApiKeyModal');
    const cancelBtn = document.getElementById('cancelApiKey');
    const saveBtn = document.getElementById('saveApiKey');
    const inputEl = document.getElementById('apiKeyInput');
    const statusEl = document.getElementById('apiKeyStatus');
    
    if (closeBtn) {
        closeBtn.onclick = () => closeModal('apiKeyModal');
    }
    
    if (cancelBtn) {
        cancelBtn.onclick = () => closeModal('apiKeyModal');
    }
    
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const apiKey = inputEl.value.trim();
            
            if (!apiKey) {
                statusEl.textContent = 'Please enter an API key';
                statusEl.className = 'api-key-status error';
                return;
            }
            
            if (!apiKey.startsWith('gsk_')) {
                statusEl.textContent = 'Invalid key format. Groq API keys start with "gsk_"';
                statusEl.className = 'api-key-status error';
                return;
            }
            
            // Show loading state
            statusEl.textContent = 'Validating API key...';
            statusEl.className = 'api-key-status loading';
            saveBtn.disabled = true;
            
            try {
                const response = await fetch(`${API_URL}/validate-key`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_key: apiKey })
                });
                
                const data = await response.json();
                
                if (data.valid) {
                    setUserApiKey(apiKey);
                    statusEl.textContent = '✓ API key saved successfully!';
                    statusEl.className = 'api-key-status success';
                    
                    // Close modal after a short delay
                    setTimeout(() => {
                        closeModal('apiKeyModal');
                        toast('API key saved! You now have unlimited access.');
                    }, 1000);
                } else {
                    statusEl.textContent = data.error || 'Invalid API key';
                    statusEl.className = 'api-key-status error';
                }
            } catch (error) {
                statusEl.textContent = 'Error validating key. Please try again.';
                statusEl.className = 'api-key-status error';
            } finally {
                saveBtn.disabled = false;
            }
        };
    }
    
    // Allow Enter key to submit
    if (inputEl) {
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                saveBtn.click();
            }
        };
    }
}

function setupPromptGuideModal() {
    const guideBtn = document.getElementById('promptGuideBtn');
    const closeBtn = document.getElementById('closePromptGuideModal');
    const modal = document.getElementById('promptGuideModal');
    
    // Open modal
    if (guideBtn) {
        guideBtn.onclick = () => {
            modal.classList.add('active');
        };
    }
    
    // Close modal
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.classList.remove('active');
        };
    }
    
    // Close on overlay click
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        };
    }
    
    // Tab switching
    const tabs = document.querySelectorAll('#promptGuideModal .guide-tab');
    const panels = document.querySelectorAll('#promptGuideModal .guide-tab-content');
    
    tabs.forEach(tab => {
        tab.onclick = () => {
            const targetPanel = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show corresponding panel
            panels.forEach(p => {
                p.classList.toggle('active', p.dataset.panel === targetPanel);
            });
        };
    });
}

// Quick prompt function (global)
window.useQuickPrompt = function(prompt) {
    // Close the modal
    document.getElementById('promptGuideModal')?.classList.remove('active');
    
    // Navigate to home/chat if not there
    showWelcome();
    
    // Insert prompt into input and focus
    setTimeout(() => {
        const input = document.getElementById('userInput');
        if (input) {
            input.value = prompt;
            input.focus();
            // Select the placeholder text for easy editing
            const placeholderStart = prompt.indexOf('[');
            if (placeholderStart !== -1) {
                const placeholderEnd = prompt.indexOf(']', placeholderStart) + 1;
                input.setSelectionRange(placeholderStart, placeholderEnd);
            }
        }
    }, 100);
    
    toast('Prompt added! Edit the [brackets] with your details.');
};

// ============================================================================
// Loading Functions
// ============================================================================

function showLoading(text = 'Loading...') {
    el.loadingText.textContent = text;
    el.loadingOverlay.classList.add('active');
}

function hideLoading() {
    el.loadingOverlay.classList.remove('active');
}

// ============================================================================
// Toast Notification
// ============================================================================

function toast(message) {
    // Show notification in top-left
    const container = document.getElementById('notificationContainer');
    const toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.textContent = message;
    container.appendChild(toastEl);
    setTimeout(() => {
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            if (toastEl.parentNode) toastEl.remove();
        }, 400);
    }, 2600);
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    if (el.chatMessages) {
        el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    }
}
window.previewPDF = async function previewPDF() {
    if (!state.currentLatexCode) return toast('No LaTeX document to preview');
    
    // Show split-pane view
    openPdfPreview();
    
    // Show loading state
    el.pdfPreviewContent.innerHTML = `
        <div class="pdf-loading">
            <div class="pdf-loading-spinner"></div>
            <p>Generating PDF preview...</p>
        </div>
    `;
    
    try {
        const resp = await fetch(`${API_URL}/preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                latex_code: state.currentLatexCode,
                filename: state.currentFilename || "document"
            })
        });
        
        if (resp.ok && resp.headers.get("content-type")?.includes("application/pdf")) {
            const blob = await resp.blob();
            
            // Clean up previous URL
            if (currentPdfUrl) {
                URL.revokeObjectURL(currentPdfUrl);
            }
            
            // Store for download/print
            currentPdfBlob = blob;
            currentPdfUrl = URL.createObjectURL(blob);
            
            // Display PDF in iframe
            el.pdfPreviewContent.innerHTML = `<iframe src="${currentPdfUrl}" title="PDF Preview"></iframe>`;
            
        } else {
            let errMsg = "Failed to compile PDF.";
            try {
                const err = await resp.json();
                errMsg = err.error || errMsg;
            } catch {}
            
            showPdfError(errMsg);
        }
    } catch (e) {
        showPdfError(e.message || "Network error while generating preview");
    }
};

// Show PDF error in the preview panel
function showPdfError(message) {
    el.pdfPreviewContent.innerHTML = `
        <div class="pdf-error">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h4>PDF Preview Error</h4>
            <p>${escapeHtml(message)}</p>
            <a href="https://www.overleaf.com/docs" target="_blank">Try compiling on Overleaf</a>
        </div>
    `;
}

// Open the split-pane PDF preview
function openPdfPreview() {
    if (el.viewContainer) {
        el.viewContainer.classList.add('split-view');
    }
    if (el.pdfPreviewPanel) {
        el.pdfPreviewPanel.style.display = 'flex';
    }
}

// Close the split-pane PDF preview
function closePdfPreview() {
    if (el.viewContainer) {
        el.viewContainer.classList.remove('split-view');
    }
    if (el.pdfPreviewPanel) {
        el.pdfPreviewPanel.style.display = 'none';
    }
    // Clean up PDF URL
    if (currentPdfUrl) {
        URL.revokeObjectURL(currentPdfUrl);
        currentPdfUrl = null;
    }
    currentPdfBlob = null;
}

// Download the current PDF
function downloadCurrentPdf() {
    if (!currentPdfBlob) {
        toast('No PDF available to download');
        return;
    }
    
    const filename = (state.currentFilename || 'document') + '.pdf';
    const link = document.createElement('a');
    link.href = currentPdfUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('PDF downloaded successfully');
}

// Print the current PDF
function printCurrentPdf() {
    if (!currentPdfUrl) {
        toast('No PDF available to print');
        return;
    }
    
    const iframe = el.pdfPreviewContent.querySelector('iframe');
    if (iframe) {
        try {
            iframe.contentWindow.print();
        } catch (e) {
            // If cross-origin issues, open in new window to print
            const printWindow = window.open(currentPdfUrl, '_blank');
            if (printWindow) {
                printWindow.addEventListener('load', () => {
                    printWindow.print();
                });
            } else {
                toast('Please allow popups to print the PDF');
            }
        }
    }
};

async function handleUpload(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast("File too large (max 10MB)");
    el.uploadProgress.classList.remove('hidden');
    el.progressFill.style.width = '0%';
    el.progressText.textContent = 'Uploading...';

    try {
        const formData = new FormData();
        formData.append('file', file);

        // Progress
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/upload`, true);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round(e.loaded / e.total * 100);
                el.progressFill.style.width = percent + '%';
                el.progressText.textContent = `Uploading... (${percent}%)`;
            }
        };

        xhr.onreadystatechange = async function () {
            if (xhr.readyState === 4) {
                el.progressFill.style.width = '100%';
                try {
                    const res = JSON.parse(xhr.responseText);
                    if (xhr.status === 200 && res.success && res.extracted_text) {
                        el.progressText.textContent = 'Converting to LaTeX...';
                        
                        // Close upload modal
                        setTimeout(() => {
                            closeModal('uploadModal');
                            el.uploadProgress.classList.add('hidden');
                        }, 500);
                        
                        // Create a new chat for the uploaded document
                        const fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
                        const fileExt = file.name.split('.').pop().toUpperCase();
                        const chatTitle = `Upload - ${fileName}`;
                        
                        const chat = {
                            id: generateId(),
                            name: chatTitle,
                            messages: [],
                            starred: false,
                            folderId: null,
                            createdAt: Date.now()
                        };
                        
                        state.chats.unshift(chat);
                        state.currentChat = chat;
                        saveState();
                        renderSidebar();
                        
                        // Show chat screen
                        showChatScreen();
                        el.chatTitle.textContent = chatTitle;
                        
                        // Reset chat input to default size
                        el.chatPromptInput.value = '';
                        el.chatPromptInput.style.height = 'auto';
                        
                        // Add user message with styled file preview
                        addUploadedFileMessage(file.name, fileExt);
                        
                        // Generate LaTeX from extracted text with improved prompt
                        const prompt = `Convert this document content into a simple, compilable LaTeX document.

STRICT RULES:
1. Use ONLY these packages: inputenc, fontenc, geometry, hyperref, enumitem, parskip
2. Use \\documentclass[11pt,a4paper]{article}
3. DO NOT use any fancy packages like fontawesome, tikz, fancyhdr, or custom commands
4. Keep the formatting simple - just sections, paragraphs, and basic lists
5. ESCAPE all special characters: \\_ for underscore, \\& for ampersand, \\% for percent, \\# for hash, \\$ for dollar
6. Start with \\documentclass and end with \\end{document}
7. Preserve the original text content exactly

DOCUMENT CONTENT:
---
${res.extracted_text}
---

Output ONLY the LaTeX code, nothing else.`;
                        
                        await generateLatex(prompt);
                        
                        toast('Document converted to LaTeX!');
                    } else {
                        el.progressText.textContent = 'Extraction failed!';
                        toast('Failed to extract text: ' + (res.error || 'Unknown error'));
                        setTimeout(() => el.uploadProgress.classList.add('hidden'), 2000);
                    }
                } catch (err) {
                    el.progressText.textContent = 'Extraction failed!';
                    toast('Failed to extract text.');
                    setTimeout(() => el.uploadProgress.classList.add('hidden'), 2000);
                }
            }
        };

        xhr.send(formData);
    } catch (e) {
        el.uploadProgress.classList.add('hidden');
        toast("Upload error: " + e.message);
    }
}

// Add a styled file upload message with pink file icon
function addUploadedFileMessage(fileName, fileExt) {
    const div = document.createElement('div');
    div.className = 'message message-user';
    div.innerHTML = `
        <div class="message-bubble">
            <div class="uploaded-file-preview">
                <div class="file-icon">
                    <svg width="32" height="40" viewBox="0 0 32 40" fill="none">
                        <path d="M0 4C0 1.79086 1.79086 0 4 0H20L32 12V36C32 38.2091 30.2091 40 28 40H4C1.79086 40 0 38.2091 0 36V4Z" fill="var(--accent-muted)"/>
                        <path d="M20 0L32 12H24C21.7909 12 20 10.2091 20 8V0Z" fill="var(--accent-dim)"/>
                        <text x="16" y="28" text-anchor="middle" fill="var(--accent)" font-size="8" font-weight="600">${fileExt}</text>
                    </svg>
                </div>
                <div class="file-info">
                    <span class="file-name">${escapeHtml(fileName)}</span>
                    <span class="file-action">Converting to LaTeX...</span>
                </div>
            </div>
        </div>`;
    el.chatMessages.appendChild(div);
    scrollToBottom();
    
    if (state.currentChat) {
        state.currentChat.messages.push({ role: 'user', content: `📄 Uploaded: ${fileName}` });
        saveState();
    }
}

// ============================================================================
// Document Summarization Feature (Clean Inline Screen)
// ============================================================================

const summarizeState = {
    selectedLength: 'medium',
    currentFile: null,
    currentResult: null,
    history: JSON.parse(localStorage.getItem('summarize_history') || '[]')
};

function initSummarizeFeature() {
    console.log('Initializing Summarize Feature...');
    
    // Tool button in sidebar
    const toolBtn = document.getElementById('summarizeToolBtn');
    console.log('Summarize tool button:', toolBtn);
    if (toolBtn) {
        toolBtn.addEventListener('click', showSummarizeScreen);
    }

    // Back button
    const backBtn = document.getElementById('summarizeBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', hideSummarizeScreen);
    }

    // Summary length pills
    document.querySelectorAll('#summarizeScreen .length-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#summarizeScreen .length-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            summarizeState.selectedLength = btn.dataset.length;
        });
    });

    // Upload drop zone
    const dropZone = document.getElementById('summarizeDropZone');
    const fileInput = document.getElementById('summarizeFileInput');
    console.log('Drop zone:', dropZone, 'File input:', fileInput);
    
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => {
            console.log('Drop zone clicked');
            fileInput.click();
        });
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) handleSummarizeUpload(file);
        });
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleSummarizeUpload(file);
        });
    }

    // New document button
    const newDocBtn = document.getElementById('summarizeNewBtn');
    if (newDocBtn) {
        newDocBtn.addEventListener('click', resetSummarizeScreen);
    }

    // Copy button
    const copyBtn = document.getElementById('summarizeCopyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copySummaryToClipboard);
    }
    
    console.log('Summarize Feature initialized');
}

function showSummarizeScreen() {
    document.getElementById('welcomeScreen')?.classList.remove('active');
    document.getElementById('chatScreen')?.classList.remove('active');
    document.getElementById('highlightScreen')?.classList.remove('active');
    
    const screen = document.getElementById('summarizeScreen');
    if (screen) {
        screen.classList.add('active');
    }
    
    resetSummarizeScreen();
}

function hideSummarizeScreen() {
    document.getElementById('summarizeScreen')?.classList.remove('active');
    
    if (state.currentChat) {
        document.getElementById('chatScreen')?.classList.add('active');
    } else {
        document.getElementById('welcomeScreen')?.classList.add('active');
    }
}

function resetSummarizeScreen() {
    document.getElementById('summarizeUploadState')?.classList.remove('hidden');
    document.getElementById('summarizeLoadingState')?.classList.add('hidden');
    document.getElementById('summarizeResultsState')?.classList.add('hidden');
    
    const fileInput = document.getElementById('summarizeFileInput');
    if (fileInput) fileInput.value = '';
    
    summarizeState.currentFile = null;
    summarizeState.currentResult = null;
}

async function handleSummarizeUpload(file) {
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
        toast('File too large (max 10MB)');
        return;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'doc', 'docx', 'txt'].includes(ext)) {
        toast('Unsupported format. Use PDF, DOC, DOCX, or TXT.');
        return;
    }

    summarizeState.currentFile = file;

    // Show loading
    document.getElementById('summarizeUploadState')?.classList.add('hidden');
    document.getElementById('summarizeLoadingState')?.classList.remove('hidden');

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', getUserApiKey());
        formData.append('summary_length', summarizeState.selectedLength);

        const response = await fetch(`${API_URL}/summarize`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            summarizeState.currentResult = data;
            addToSummarizeHistory(file.name, data);
            displaySummarizeResults(file.name, data);
        } else {
            toast(data.error || 'Failed to summarize document');
            resetSummarizeScreen();
        }
    } catch (e) {
        toast('Error: ' + e.message);
        resetSummarizeScreen();
    }
}

function displaySummarizeResults(filename, data) {
    document.getElementById('summarizeLoadingState')?.classList.add('hidden');
    document.getElementById('summarizeResultsState')?.classList.remove('hidden');

    // File info
    const fileNameEl = document.getElementById('summaryFileName');
    const lengthBadge = document.getElementById('summaryLengthBadge');
    
    if (fileNameEl) fileNameEl.textContent = filename;
    if (lengthBadge) {
        const lengthText = summarizeState.selectedLength.charAt(0).toUpperCase() + summarizeState.selectedLength.slice(1);
        lengthBadge.textContent = lengthText;
    }

    // Summary text
    const summaryText = document.getElementById('summaryText');
    if (summaryText) {
        summaryText.textContent = data.summary || 'No summary available.';
    }

    // Key points
    const keyPointsList = document.getElementById('keyPointsList');
    if (keyPointsList) {
        keyPointsList.innerHTML = '';
        (data.key_points || []).forEach(point => {
            const li = document.createElement('li');
            li.textContent = point;
            keyPointsList.appendChild(li);
        });
    }

    // Topics
    const topicsList = document.getElementById('topicsList');
    if (topicsList) {
        topicsList.innerHTML = '';
        (data.main_topics || []).forEach(topic => {
            const span = document.createElement('span');
            span.className = 'topic-tag';
            span.textContent = topic;
            topicsList.appendChild(span);
        });
    }
}

function copySummaryToClipboard() {
    if (!summarizeState.currentResult) return;
    
    const data = summarizeState.currentResult;
    const keyPoints = (data.key_points || []).map(p => '• ' + p).join('\n');
    const topics = (data.main_topics || []).join(', ');

    const fullText = `SUMMARY\n\n${data.summary || ''}\n\nKEY POINTS:\n${keyPoints}\n\nTOPICS: ${topics}`;

    navigator.clipboard.writeText(fullText).then(() => {
        toast('Copied to clipboard!');
    }).catch(() => {
        toast('Failed to copy');
    });
}

function addToSummarizeHistory(filename, data) {
    const entry = {
        id: Date.now(),
        filename,
        date: new Date().toISOString(),
        length: summarizeState.selectedLength,
        summary: data.summary,
        key_points: data.key_points,
        main_topics: data.main_topics
    };
    
    summarizeState.history.unshift(entry);
    if (summarizeState.history.length > 20) {
        summarizeState.history = summarizeState.history.slice(0, 20);
    }
    localStorage.setItem('summarize_history', JSON.stringify(summarizeState.history));
}

// ============================================================================
// Text Highlighting & Notes Feature (Clean Inline Screen)
// ============================================================================

const highlightState = {
    currentFile: null,
    currentResult: null,
    selectedColor: 'yellow',
    userHighlights: [],
    userNotes: [],
    history: JSON.parse(localStorage.getItem('highlight_history') || '[]'),
    activeTab: 'insights'
};

function initHighlightFeature() {
    console.log('[Highlight] Initializing...');
    
    // Tool button
    const toolBtn = document.getElementById('highlightToolBtn');
    if (toolBtn) {
        toolBtn.addEventListener('click', showHighlightScreen);
    }

    // Back button
    const backBtn = document.getElementById('highlightBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', hideHighlightScreen);
    }

    // Upload drop zone
    const dropZone = document.getElementById('highlightDropZone');
    const fileInput = document.getElementById('highlightFileInput');
    
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) handleHighlightUpload(file);
        });
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleHighlightUpload(file);
        });
    }

    // Color picker buttons
    document.querySelectorAll('#highlightScreen .hl-color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#highlightScreen .hl-color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            highlightState.selectedColor = btn.dataset.color;
        });
    });

    // Panel tabs (Insights, Notes, Keywords)
    document.querySelectorAll('#highlightScreen .hl-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchHighlightTab(tabName);
        });
    });

    // Insights filter buttons
    document.querySelectorAll('#highlightScreen .hl-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#highlightScreen .hl-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            filterInsights(filter);
        });
    });

    // Note tag selector
    document.querySelectorAll('#highlightScreen .hl-tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#highlightScreen .hl-tag-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            highlightState.selectedNoteTag = btn.dataset.tag;
        });
    });

    // Notes filter buttons
    document.querySelectorAll('#highlightScreen .hl-notes-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#highlightScreen .hl-notes-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            filterUserNotes(filter);
        });
    });

    // Add note button
    const addNoteBtn = document.getElementById('hlAddNoteBtn');
    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', addUserNote);
    }

    // New document button
    const newDocBtn = document.getElementById('highlightNewBtn');
    if (newDocBtn) {
        newDocBtn.addEventListener('click', resetHighlightScreen);
    }

    // Export button
    const exportBtn = document.getElementById('highlightExportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportHighlightNotes);
    }

    // Clear highlights button
    const clearBtn = document.getElementById('hlClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearUserHighlights);
    }

    // Setup text selection context menu
    setupTextSelection();
    
    // Initialize state variables
    highlightState.selectedNoteTag = 'general';
    highlightState.insightFilter = 'all';
    highlightState.noteFilter = 'all';
    
    console.log('[Highlight] Initialized successfully');
}

function showHighlightScreen() {
    console.log('[Highlight] Showing screen');
    document.getElementById('welcomeScreen')?.classList.remove('active');
    document.getElementById('chatScreen')?.classList.remove('active');
    document.getElementById('summarizeScreen')?.classList.remove('active');
    
    const screen = document.getElementById('highlightScreen');
    if (screen) {
        screen.classList.add('active');
    }
    
    resetHighlightScreen();
}

function hideHighlightScreen() {
    document.getElementById('highlightScreen')?.classList.remove('active');
    
    if (state.currentChat) {
        document.getElementById('chatScreen')?.classList.add('active');
    } else {
        document.getElementById('welcomeScreen')?.classList.add('active');
    }
}

function resetHighlightScreen() {
    // Show upload state, hide others
    document.getElementById('highlightUploadState')?.classList.remove('hidden');
    document.getElementById('highlightLoadingState')?.classList.add('hidden');
    document.getElementById('highlightWorkspace')?.classList.add('hidden');
    
    const fileInput = document.getElementById('highlightFileInput');
    if (fileInput) fileInput.value = '';
    
    // Update doc info
    const docInfo = document.getElementById('hlDocInfo');
    if (docInfo) docInfo.textContent = 'No document loaded';
    
    highlightState.currentFile = null;
    highlightState.currentResult = null;
    highlightState.userHighlights = [];
    highlightState.userNotes = [];
    
    updateNoteCounts();
}

function switchHighlightTab(tabName) {
    highlightState.activeTab = tabName;
    
    document.querySelectorAll('#highlightScreen .hl-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    
    document.querySelectorAll('#highlightScreen .hl-tab-content').forEach(p => {
        p.classList.toggle('active', p.dataset.panel === tabName);
    });
}

function filterInsights(filter) {
    highlightState.insightFilter = filter;
    const items = document.querySelectorAll('#hlInsightsList .hl-insight-card');
    
    items.forEach(item => {
        if (filter === 'all') {
            item.style.display = '';
        } else {
            const category = item.dataset.category;
            item.style.display = category === filter ? '' : 'none';
        }
    });
}

function filterUserNotes(filter) {
    highlightState.noteFilter = filter;
    const items = document.querySelectorAll('#hlNotesList .hl-note-card');
    
    items.forEach(item => {
        if (filter === 'all') {
            item.style.display = '';
        } else {
            const tag = item.dataset.tag;
            item.style.display = tag === filter ? '' : 'none';
        }
    });
}

async function handleHighlightUpload(file) {
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
        toast('File too large (max 10MB)');
        return;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'doc', 'docx', 'txt'].includes(ext)) {
        toast('Unsupported format. Use PDF, DOC, DOCX, or TXT.');
        return;
    }

    highlightState.currentFile = file;

    // Show loading
    document.getElementById('highlightUploadState')?.classList.add('hidden');
    document.getElementById('highlightLoadingState')?.classList.remove('hidden');

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', getUserApiKey());

        const response = await fetch(`${API_URL}/analyze-highlights`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            highlightState.currentResult = data;
            addToHighlightHistory(file.name, data);
            displayHighlightResults(file.name, data);
        } else {
            toast(data.error || 'Failed to analyze document');
            resetHighlightScreen();
        }
    } catch (e) {
        toast('Error: ' + e.message);
        resetHighlightScreen();
    }
}

function displayHighlightResults(filename, data) {
    document.getElementById('highlightLoadingState')?.classList.add('hidden');
    document.getElementById('highlightWorkspace')?.classList.remove('hidden');

    // Update doc info
    const docInfo = document.getElementById('hlDocInfo');
    if (docInfo) docInfo.textContent = filename;

    // Render document with AI highlights
    renderDocumentContent(data.original_text || '', data.highlights || []);

    // Render AI insights list
    renderAIInsightsList(data.highlights || []);

    // Render keywords
    renderKeywordsCloud(data.keywords || []);

    // Render user notes (empty initially)
    renderUserNotes();
    
    // Update counts
    updateNoteCounts();
}

function renderDocumentContent(text, aiHighlights) {
    const container = document.getElementById('hlReaderContent');
    if (!container) return;

    let displayText = escapeHtml(text);

    // Apply AI highlights
    const sorted = [...aiHighlights].sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0));
    
    sorted.forEach((h, idx) => {
        if (h.text) {
            const escapedText = escapeHtml(h.text);
            const regex = new RegExp(escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            displayText = displayText.replace(regex, 
                `<span class="ai-highlight" data-idx="${idx}" data-category="${h.category || 'general'}">${escapedText}</span>`
            );
        }
    });

    displayText = displayText.replace(/\n/g, '<br>');
    container.innerHTML = displayText;

    // Click handlers for AI highlights
    container.querySelectorAll('.ai-highlight').forEach(mark => {
        mark.addEventListener('click', () => {
            const idx = parseInt(mark.dataset.idx);
            scrollToInsight(idx);
        });
    });
}

function renderAIInsightsList(highlights) {
    const list = document.getElementById('hlInsightsList');
    if (!list) return;

    if (highlights.length === 0) {
        list.innerHTML = `
            <div class="hl-empty-state">
                <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                <p>No key insights detected in this document</p>
            </div>`;
        return;
    }

    list.innerHTML = highlights.map((h, idx) => `
        <div class="hl-insight-card ${h.category || 'general'}" data-idx="${idx}" data-category="${h.category || 'general'}">
            <div class="hl-insight-text">${escapeHtml(h.text || '')}</div>
            <div class="hl-insight-meta">
                <span class="hl-insight-tag ${h.category || 'general'}">${h.category || 'insight'}</span>
                <div class="hl-insight-actions">
                    <button class="hl-insight-action" onclick="scrollToDocHighlight(${idx})" title="Find in document">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="3"/><path d="M21 21l-6-6"/></svg>
                    </button>
                    <button class="hl-insight-action" onclick="copyInsightText(${idx})" title="Copy text">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.hl-insight-card').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.hl-insight-action')) return;
            const idx = parseInt(item.dataset.idx);
            scrollToDocHighlight(idx);
        });
    });
    
    // Update tab count
    const countEl = document.querySelector('.hl-tab[data-tab="insights"] .hl-tab-count');
    if (countEl) countEl.textContent = highlights.length;
}

function scrollToInsight(idx) {
    switchHighlightTab('insights');
    const item = document.querySelector(`.hl-insight-card[data-idx="${idx}"]`);
    if (item) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.style.background = 'var(--accent-muted)';
        setTimeout(() => { item.style.background = ''; }, 1500);
    }
}

function scrollToDocHighlight(idx) {
    const mark = document.querySelector(`.ai-highlight[data-idx="${idx}"]`);
    if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mark.style.background = 'rgba(255, 161, 245, 0.6)';
        setTimeout(() => { mark.style.background = ''; }, 1500);
    }
}

function copyInsightText(idx) {
    const highlights = highlightState.currentResult?.highlights || [];
    if (highlights[idx]) {
        navigator.clipboard.writeText(highlights[idx].text);
        toast('Copied to clipboard!');
    }
}

function renderKeywordsCloud(keywords) {
    const container = document.getElementById('hlKeywordsCloud');
    if (!container) return;

    if (keywords.length === 0) {
        container.innerHTML = `
            <div class="hl-empty-state">
                <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16M4 12h16M4 20h10"/></svg>
                <p>No keywords detected</p>
            </div>`;
        return;
    }

    container.innerHTML = keywords.map(kw => 
        `<span class="hl-keyword" data-keyword="${escapeHtml(kw)}">${escapeHtml(kw)}</span>`
    ).join('');

    container.querySelectorAll('.hl-keyword').forEach(chip => {
        chip.addEventListener('click', () => {
            // Toggle highlighted state
            chip.classList.toggle('highlighted');
            highlightKeywordInDocument(chip.textContent, chip.classList.contains('highlighted'));
        });
    });
    
    // Update tab count
    const countEl = document.querySelector('.hl-tab[data-tab="keywords"] .hl-tab-count');
    if (countEl) countEl.textContent = keywords.length;
}

function highlightKeywordInDocument(keyword, show = true) {
    const container = document.getElementById('hlReaderContent');
    if (!container) return;

    // Remove previous temp highlights
    container.querySelectorAll('.keyword-temp-highlight').forEach(el => {
        el.replaceWith(el.textContent);
    });

    if (!show) return;

    // Find and highlight keyword
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const nodesToReplace = [];

    while (walker.nextNode()) {
        if (regex.test(walker.currentNode.textContent)) {
            nodesToReplace.push(walker.currentNode);
        }
    }

    nodesToReplace.forEach(node => {
        const span = document.createElement('span');
        span.innerHTML = node.textContent.replace(regex, '<span class="keyword-temp-highlight">$1</span>');
        node.replaceWith(span);
    });

    // Scroll to first occurrence
    const firstMatch = container.querySelector('.keyword-temp-highlight');
    if (firstMatch) {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    toast(`Highlighted "${keyword}"`);
}

function setupTextSelection() {
    const container = document.getElementById('hlReaderContent');
    const contextMenu = document.getElementById('highlightContextMenu');
    
    if (!container || !contextMenu) {
        console.log('[Highlight] Context menu elements not found');
        return;
    }

    container.addEventListener('mouseup', (e) => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText.length > 2) {
            contextMenu.classList.remove('hidden');
            contextMenu.style.left = e.pageX + 'px';
            contextMenu.style.top = e.pageY + 'px';
            contextMenu.dataset.selectedText = selectedText;
        }
    });

    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.classList.add('hidden');
        }
    });

    const highlightBtn = document.getElementById('ctxHighlightBtn');
    if (highlightBtn) {
        highlightBtn.addEventListener('click', () => {
            const text = contextMenu.dataset.selectedText;
            if (text) addUserHighlight(text);
            contextMenu.classList.add('hidden');
            window.getSelection().removeAllRanges();
        });
    }

    const addNoteContextBtn = document.getElementById('ctxAddNoteBtn');
    if (addNoteContextBtn) {
        addNoteContextBtn.addEventListener('click', () => {
            const text = contextMenu.dataset.selectedText;
            if (text) promptForNote(text);
            contextMenu.classList.add('hidden');
            window.getSelection().removeAllRanges();
        });
    }
    
    const copyBtn = document.getElementById('ctxCopyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const text = contextMenu.dataset.selectedText;
            if (text) {
                navigator.clipboard.writeText(text);
                toast('Copied to clipboard!');
            }
            contextMenu.classList.add('hidden');
            window.getSelection().removeAllRanges();
        });
    }
}

function addUserHighlight(text) {
    const highlight = {
        id: Date.now(),
        text,
        color: highlightState.selectedColor,
        timestamp: Date.now()
    };
    
    highlightState.userHighlights.push(highlight);
    applyUserHighlights();
    toast('Text highlighted!');
}

function applyUserHighlights() {
    const container = document.getElementById('hlReaderContent');
    if (!container || !highlightState.currentResult) return;

    // Re-render document with all highlights
    renderDocumentContent(
        highlightState.currentResult.original_text || '',
        highlightState.currentResult.highlights || []
    );

    // Apply user highlights on top
    highlightState.userHighlights.forEach(h => {
        const regex = new RegExp(h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        container.innerHTML = container.innerHTML.replace(regex, 
            `<span class="user-highlight" data-color="${h.color}" data-id="${h.id}">${escapeHtml(h.text)}</span>`
        );
    });
}

function clearUserHighlights() {
    highlightState.userHighlights = [];
    if (highlightState.currentResult) {
        renderDocumentContent(
            highlightState.currentResult.original_text || '',
            highlightState.currentResult.highlights || []
        );
    }
    toast('Highlights cleared');
}

function promptForNote(selectedText) {
    const note = prompt('Add a note for this text:');
    if (note && note.trim()) {
        addNoteWithHighlight(selectedText, note.trim());
    }
}

function addNoteWithHighlight(highlightText, noteText) {
    const note = {
        id: Date.now(),
        highlightText,
        noteText,
        tag: highlightState.selectedNoteTag || 'general',
        color: highlightState.selectedColor,
        timestamp: Date.now()
    };
    
    highlightState.userNotes.push(note);
    addUserHighlight(highlightText);
    renderUserNotes();
    updateNoteCounts();
    switchHighlightTab('notes');
    toast('Note added!');
}

function addUserNote() {
    const textarea = document.getElementById('hlNoteTextarea');
    const text = textarea?.value?.trim();
    
    if (!text) {
        toast('Please enter a note');
        return;
    }
    
    const note = {
        id: Date.now(),
        highlightText: null,
        noteText: text,
        tag: highlightState.selectedNoteTag || 'general',
        timestamp: Date.now()
    };
    
    highlightState.userNotes.push(note);
    textarea.value = '';
    renderUserNotes();
    updateNoteCounts();
    toast('Note added!');
}

function renderUserNotes() {
    const list = document.getElementById('hlNotesList');
    if (!list) return;

    if (highlightState.userNotes.length === 0) {
        list.innerHTML = `
            <div class="hl-empty-state">
                <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <p>No notes yet. Select text to add notes!</p>
            </div>`;
        return;
    }

    list.innerHTML = highlightState.userNotes.map(note => `
        <div class="hl-note-card" data-id="${note.id}" data-tag="${note.tag || 'general'}">
            <div class="hl-note-header">
                <span class="hl-note-tag ${note.tag || 'general'}">${note.tag || 'general'}</span>
                <div class="hl-note-actions">
                    <button class="hl-note-action" onclick="editUserNote(${note.id})" title="Edit">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="hl-note-action delete" onclick="deleteUserNote(${note.id})" title="Delete">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                </div>
            </div>
            <div class="hl-note-text">${escapeHtml(note.noteText)}</div>
            ${note.highlightText ? `<div class="hl-note-reference">"${escapeHtml(note.highlightText.substring(0, 100))}${note.highlightText.length > 100 ? '...' : ''}"</div>` : ''}
            <div class="hl-note-footer">
                <span class="hl-note-time">
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    ${formatNoteTime(note.timestamp)}
                </span>
            </div>
        </div>
    `).join('');
}

function editUserNote(id) {
    const note = highlightState.userNotes.find(n => n.id === id);
    if (!note) return;
    
    const newText = prompt('Edit note:', note.noteText);
    if (newText && newText.trim()) {
        note.noteText = newText.trim();
        note.editedAt = Date.now();
        renderUserNotes();
        toast('Note updated!');
    }
}

function deleteUserNote(id) {
    highlightState.userNotes = highlightState.userNotes.filter(n => n.id !== id);
    renderUserNotes();
    updateNoteCounts();
    toast('Note deleted');
}

function updateNoteCounts() {
    // Update notes tab count
    const notesCount = document.querySelector('.hl-tab[data-tab="notes"] .hl-tab-count');
    if (notesCount) notesCount.textContent = highlightState.userNotes.length;
}

function exportHighlightNotes() {
    if (!highlightState.currentResult && highlightState.userNotes.length === 0) {
        toast('Nothing to export');
        return;
    }
    
    let exportText = `# Document Analysis Export\n`;
    exportText += `Generated: ${new Date().toLocaleString()}\n\n`;
    
    if (highlightState.currentFile) {
        exportText += `## Document: ${highlightState.currentFile.name}\n\n`;
    }
    
    // AI Insights
    const highlights = highlightState.currentResult?.highlights || [];
    if (highlights.length > 0) {
        exportText += `## AI Insights (${highlights.length})\n\n`;
        highlights.forEach((h, i) => {
            exportText += `${i + 1}. [${h.category || 'insight'}] ${h.text}\n\n`;
        });
    }
    
    // Keywords
    const keywords = highlightState.currentResult?.keywords || [];
    if (keywords.length > 0) {
        exportText += `## Keywords\n`;
        exportText += keywords.join(', ') + '\n\n';
    }
    
    // User Notes
    if (highlightState.userNotes.length > 0) {
        exportText += `## My Notes (${highlightState.userNotes.length})\n\n`;
        highlightState.userNotes.forEach((note, i) => {
            exportText += `${i + 1}. [${note.tag || 'general'}] ${note.noteText}\n`;
            if (note.highlightText) {
                exportText += `   Reference: "${note.highlightText.substring(0, 100)}..."\n`;
            }
            exportText += `   Added: ${formatNoteTime(note.timestamp)}\n\n`;
        });
    }
    
    // Download as text file
    const blob = new Blob([exportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes_export_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast('Notes exported!');
}

function formatNoteTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return date.toLocaleDateString();
}

function addToHighlightHistory(filename, data) {
    const entry = {
        id: Date.now(),
        filename,
        date: new Date().toISOString(),
        highlightCount: (data.highlights || []).length,
        keywordCount: (data.keywords || []).length
    };
    
    highlightState.history.unshift(entry);
    
    if (highlightState.history.length > 20) {
        highlightState.history = highlightState.history.slice(0, 20);
    }
    
    localStorage.setItem('highlight_history', JSON.stringify(highlightState.history));
}

// ============================================================================
// Global Function Exports (for onclick handlers in HTML)
// ============================================================================

window.toggleFolder = toggleFolder;
window.loadChat = loadChat;
window.editFolder = editFolder;
window.deleteFolder = deleteFolder;
window.moveChatToFolder = moveChatToFolder;
window.copyCode = copyCode;
window.downloadTex = downloadTex;
window.openOverleaf = openOverleaf;
window.deleteUserNote = deleteUserNote;
window.editUserNote = editUserNote;
window.scrollToDocHighlight = scrollToDocHighlight;
window.copyInsightText = copyInsightText;
window.showSummarizeScreen = showSummarizeScreen;
window.showHighlightScreen = showHighlightScreen;
