/**
 * LaTeX AI - Complete Application
 * By TIKA Imad - ENSA
 * National School of Applied Sciences
 */

const API_URL = 'http://localhost:5000';

// ============================================================================
// State Management
// ============================================================================

const state = {
    currentChat: null,
    chats: [],
    folders: [],
    sidebarOpen: true,
    currentLatexCode: '',
    currentFilename: ''
};

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
    cv: 'Create a professional CV for a software developer with experience, education, and skills sections',
    pfe: 'Create a thesis cover page for a computer science student with university, title, student name, and supervisor',
    letter: 'Create a professional cover letter for a technology job application',
    report: 'Create a technical report with introduction, methodology, results, and conclusion',
    presentation: 'Create a Beamer presentation with title slide, outline, and content slides'
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
    loadState();
    cacheElements();
    setupListeners();
    startTyping();
    renderSidebar();
}

function cacheElements() {
    el = {
        // Sidebar
        sidebar: document.getElementById('sidebar'),
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
        toastContainer: document.getElementById('toastContainer')
    };
}

// ============================================================================
// Event Listeners Setup
// ============================================================================

function setupListeners() {
    // Sidebar toggle
    el.closeSidebar.onclick = () => toggleSidebar(false);
    el.openSidebar.onclick = () => toggleSidebar(true);
    
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
    
    // Chat header actions
    el.backBtn.onclick = goHome;
    el.editTitleBtn.onclick = openRenameModal;
    el.starChatBtn.onclick = toggleStar;
    el.moveChatBtn.onclick = openMoveModal;
    el.deleteChatBtn.onclick = confirmDeleteChat;
    
    // About modal
    el.aboutBtn.onclick = () => openModal('aboutModal');
    el.closeAboutModal.onclick = () => closeModal('aboutModal');
    
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
// Textarea Auto Resize
// ============================================================================

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
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
    el.welcomeScreen.style.display = 'none';
    el.chatScreen.classList.add('active');
    
    if (state.currentChat) {
        el.chatTitle.textContent = state.currentChat.name;
        updateStarButton();
    }
}

function goHome() {
    el.chatScreen.classList.remove('active');
    el.welcomeScreen.style.display = 'flex';
    state.currentChat = null;
    renderSidebar();
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
        codeHtml = `
            <div class="code-block">
                <div class="code-header">
                    <span class="code-lang">LaTeX</span>
                    <div class="code-actions">
                        <button class="code-btn" onclick="copyCode()">Copy</button>
                        <button class="code-btn" onclick="downloadTex()">Download .tex</button>
                        <button class="code-btn primary" onclick="openOverleaf()">Open in Overleaf</button>
                    </div>
                </div>
                <div class="code-content">
                    <pre>${escapeHtml(code)}</pre>
                </div>
            </div>`;
    }
    
    div.innerHTML = `
        <div class="message-header">
            <div class="assistant-avatar">
                <img src="LTX.png" alt="AI">
            </div>
            <span class="assistant-name">LaTeX AI</span>
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

function addErrorMessage(text) {
    const div = document.createElement('div');
    div.className = 'message message-assistant';
    div.innerHTML = `
        <div class="message-header">
            <div class="assistant-avatar">
                <img src="LTX.png" alt="AI">
            </div>
            <span class="assistant-name">LaTeX AI</span>
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
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.currentFilename = data.filename;
            state.currentLatexCode = data.latex_code;
            addAssistantMessage(
                'Your LaTeX document is ready! You can copy the code, download as .tex file, or open directly in Overleaf to compile and get your PDF.',
                data.latex_code
            );
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

function toggleStar() {
    if (!state.currentChat) return;
    
    state.currentChat.starred = !state.currentChat.starred;
    updateStarButton();
    saveState();
    renderSidebar();
    toast(state.currentChat.starred ? 'Chat starred' : 'Star removed');
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
    const toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.textContent = message;
    el.toastContainer.appendChild(toastEl);
    
    setTimeout(() => {
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateX(20px)';
        setTimeout(() => {
            if (toastEl.parentNode) {
                toastEl.remove();
            }
        }, 300);
    }, 3000);
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