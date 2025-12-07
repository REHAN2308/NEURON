'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useEditorStore } from '@/store/useEditorStore';
import { useSocket } from '@/hooks/useSocket';
import { API_ENDPOINTS } from '@/lib/config';
import CodeViewer from './CodeViewer';
import CodeViewerWithTabs from './CodeViewerWithTabs';
import LivePreview, { setSharedViewport } from './LivePreview';
import { InspectorPanel } from './Inspector';
import { 
  Code2,
  Download,
  Eye,
  Copy,
  Check,
  Save,
  Send,
  Sparkles,
  Monitor,
  Smartphone,
  Tablet,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Layers
} from 'lucide-react';

type ViewTab = 'code' | 'preview';
type ViewportSize = 'desktop' | 'tablet' | 'mobile';

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

// API response type for chat history
interface ApiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// Welcome message content (not the object, to avoid recreating Date on every import)
const WELCOME_MESSAGE_CONTENT = "Ready to refine your design. Just describe what you'd like to change — colors, layout, components — and I'll handle the code.";

// Factory function to create a fresh welcome message
function createWelcomeMessage(): ChatMessage {
  return {
    id: 'welcome',
    role: 'ai',
    content: WELCOME_MESSAGE_CONTENT,
    timestamp: new Date(),
    isStreaming: false,
  };
}

export default function Workspace() {
  const { generatedCode, status, settings, projectId, setIsModifying: setGlobalIsModifying } = useProjectStore();
  const { initializeFromCode } = useEditorStore();
  
  // Connect to socket for real-time updates (automatically joins project room based on projectId from store)
  const { onCodeUpdate } = useSocket();
  
  const [activeTab, setActiveTab] = useState<ViewTab>('preview');
  const [copied, setCopied] = useState(false);
  const [isModifyingLocal, setIsModifyingLocal] = useState(false);
  
  // Wrapper to set both local and global modifying state
  // Global state prevents the page from hiding the Workspace during modifications
  const isModifying = isModifyingLocal;
  const setIsModifying = useCallback((value: boolean) => {
    setIsModifyingLocal(value);
    setGlobalIsModifying(value);
  }, [setGlobalIsModifying]);
  
  const [chatInput, setChatInput] = useState('');
  // BUG FIX: Initialize with empty array, let useEffect populate with welcome or history
  // This prevents the welcome message from being duplicated when history loads
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true); // Start as loading
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [viewport, setViewportLocal] = useState<ViewportSize>('desktop');
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{
    id: string;
    tagName: string;
    className: string;
    textContent?: string;
    styles: Record<string, string>;
    boundingBox: { width: number; height: number; x: number; y: number };
  } | null>(null);
  
  // Wrapper to set both local viewport and shared viewport
  const setViewport = useCallback((v: ViewportSize) => {
    setViewportLocal(v);
    setSharedViewport(v);
  }, []);
  
  // BUG FIX: Use state instead of just ref to trigger effect re-run when pending changes
  const [pendingAiMessageId, setPendingAiMessageId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pendingModifyRef = useRef<string | null>(null); // Stores the AI message ID for pending modify
  // BUG FIX: Track loaded projectId to prevent re-fetching on every render
  const loadedProjectIdRef = useRef<string | null>(null);
  // FIX: Track if we've already set initial messages to prevent duplication
  const hasSetInitialMessages = useRef(false);
  
  // Show workspace if we have generated code AND (status is completed OR we're modifying)
  const showWorkspace = generatedCode && (status === 'completed' || isModifying);
  
  // Initialize editor store when generated code changes
  useEffect(() => {
    if (generatedCode) {
      initializeFromCode(generatedCode, settings.codeType);
    }
  }, [generatedCode, settings.codeType, initializeFromCode]);

  // BUG FIX: Load chat history when projectId changes
  // This effect now properly handles:
  // 1. Initial mount with projectId
  // 2. ProjectId changes
  // 3. Shows welcome message ONLY if no history exists AND we haven't set messages yet
  useEffect(() => {
    // If no projectId, show welcome message once and stop
    if (!projectId) {
      if (!hasSetInitialMessages.current) {
        setChatMessages([createWelcomeMessage()]);
        hasSetInitialMessages.current = true;
      }
      setIsLoadingHistory(false);
      return;
    }
    
    // BUG FIX: Skip if we already loaded this project's history
    if (loadedProjectIdRef.current === projectId) {
      return;
    }
    
    // Reset the hasSetInitialMessages flag when projectId changes
    // This allows a new project to show its own welcome message if needed
    if (loadedProjectIdRef.current !== projectId) {
      hasSetInitialMessages.current = false;
    }
    
    // Prevent double-loading in React StrictMode
    let isCancelled = false;
    
    const loadChatHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const response = await fetch(API_ENDPOINTS.chatHistory(projectId));
        
        // Check if effect was cancelled (component unmounted or re-rendered)
        if (isCancelled) return;
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data.messages && data.data.messages.length > 0) {
            // BUG FIX: History exists - show ONLY the loaded messages
            // Do NOT prepend welcome message to avoid duplication
            const loadedMessages: ChatMessage[] = data.data.messages.map((msg: ApiChatMessage) => ({
              id: msg.id,
              role: msg.role === 'assistant' ? 'ai' : 'user',
              content: msg.content,
              timestamp: new Date(msg.createdAt),
              isStreaming: false,
            }));
            setChatMessages(loadedMessages);
          } else {
            // No history - show welcome message only (just once)
            setChatMessages([createWelcomeMessage()]);
          }
          hasSetInitialMessages.current = true;
        } else {
          // API error - show welcome message
          console.error('Failed to load chat history: HTTP', response.status);
          if (!hasSetInitialMessages.current) {
            setChatMessages([createWelcomeMessage()]);
            hasSetInitialMessages.current = true;
          }
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
        // Network error - show welcome message (only if not already set)
        if (!hasSetInitialMessages.current) {
          setChatMessages([createWelcomeMessage()]);
          hasSetInitialMessages.current = true;
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingHistory(false);
          // BUG FIX: Mark this projectId as loaded to prevent re-fetching
          loadedProjectIdRef.current = projectId;
        }
      }
    };
    
    loadChatHistory();
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleCopyCode = async () => {
    if (generatedCode) {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (generatedCode) {
      const blob = new Blob([generatedCode], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated-code.${settings.codeType.toLowerCase() === 'react' ? 'jsx' : 'html'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // Handle code update from socket
  // BUG FIX: Now uses pendingAiMessageId state to properly track the pending message
  const handleCodeUpdateFromSocket = useCallback((updatedCode: string, aiMessageId: string) => {
    console.log(`\n════════════════════════════════════════════════════════`);
    console.log(`🎯 [WORKSPACE] handleCodeUpdateFromSocket triggered!`);
    console.log(`════════════════════════════════════════════════════════`);
    console.log(`   📋 AI Message ID: ${aiMessageId}`);
    console.log(`   📊 Updated code length: ${updatedCode?.length || 0}`);
    console.log(`   📊 Current pendingModifyRef: ${pendingModifyRef.current}`);
    
    // Mark the message as complete (stop streaming indicator)
    // The conversational reply content is already set from the API response
    setChatMessages(prev => prev.map(msg => 
      msg.id === aiMessageId 
        ? { ...msg, isStreaming: false }
        : msg
    ));
    setActiveTab('preview');
    setIsModifying(false);
    setPendingAiMessageId(null);
    pendingModifyRef.current = null;
    
    console.log(`   ✅ Chat message marked as complete, tab switched to preview`);
    console.log(`   ✅ Modifying state reset to false`);
    console.log(`════════════════════════════════════════════════════════\n`);
  }, []);

  // BUG FIX: Listen for code updates - now uses pendingAiMessageId state to properly trigger effect
  useEffect(() => {
    if (!pendingAiMessageId || !projectId) {
      console.log(`[WORKSPACE] Socket listener effect: Skipping setup (pendingAiMessageId=${pendingAiMessageId}, projectId=${projectId})`);
      return;
    }
    
    console.log(`\n══════════════════════════════════════════════════════════════`);
    console.log(`📡 [WORKSPACE] Setting up socket listener for code updates`);
    console.log(`══════════════════════════════════════════════════════════════`);
    console.log(`   📋 Project ID: ${projectId}`);
    console.log(`   📋 Pending AI Message ID: ${pendingAiMessageId}`);
    console.log(`══════════════════════════════════════════════════════════════\n`);
    
    const aiMessageId = pendingAiMessageId;
    
    // Register callback for code updates via socket
    const cleanup = onCodeUpdate(projectId, (updatedCode: string) => {
      console.log(`\n🎉 [WORKSPACE] Socket callback invoked!`);
      console.log(`   📦 Received ${updatedCode?.length || 0} characters of code`);
      handleCodeUpdateFromSocket(updatedCode, aiMessageId);
    });
    
    // Timeout after 60 seconds if no socket response
    const timeout = setTimeout(() => {
      if (pendingModifyRef.current === aiMessageId) {
        console.log(`\n⏰ [WORKSPACE] Socket timeout reached (60s) for message ${aiMessageId}`);
        setChatMessages(prev => prev.map(msg => 
          msg.id === aiMessageId 
            ? { ...msg, content: '⚠️ The request is taking longer than expected. The changes may still apply - please wait or try again.', isStreaming: false }
            : msg
        ));
        setIsModifying(false);
        setPendingAiMessageId(null);
        pendingModifyRef.current = null;
      }
    }, 60000);
    
    return () => {
      console.log(`[WORKSPACE] Cleaning up socket listener for project ${projectId}`);
      cleanup();
      clearTimeout(timeout);
    };
  }, [projectId, pendingAiMessageId, onCodeUpdate, handleCodeUpdateFromSocket]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isModifying) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date(),
    };
    setChatMessages(prev => [...prev, userMessage]);
    const userText = chatInput.trim();
    setChatInput('');
    setIsModifying(true);

    // Add streaming placeholder for AI response
    const aiMessageId = (Date.now() + 1).toString();
    setChatMessages(prev => [...prev, {
      id: aiMessageId,
      role: 'ai',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    }]);

    // Check if user wants to modify code (keywords: change, modify, update, make, add, remove, fix, etc.)
    const modifyKeywords = /\b(change|modify|update|make|add|remove|delete|fix|replace|edit|transform|convert|set|adjust|increase|decrease|move|align|center|style|color|font|size|padding|margin|border|background|layout|responsive|animation|hover|dark\s*mode|light\s*mode)\b/i;
    const isCodeModification = modifyKeywords.test(userText) && generatedCode;

    try {
      if (isCodeModification && generatedCode && projectId) {
        // Code modification request - use the apply-change endpoint
        setChatMessages(prev => prev.map(msg => 
          msg.id === aiMessageId 
            ? { ...msg, content: '⏳ Applying change... This may take a moment.', isStreaming: true }
            : msg
        ));

        // Store the AI message ID for the socket callback
        // BUG FIX: Set both ref and state - state triggers effect, ref for synchronous access
        pendingModifyRef.current = aiMessageId;
        setPendingAiMessageId(aiMessageId);

        const response = await fetch(API_ENDPOINTS.applyChange(projectId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userText,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Apply-change job queued:', data.jobId);
          
          // Use the AI-generated chat reply from the backend
          const chatReplyContent = data.chatReply?.content || '🔄 Working on it...';
          
          // Update message with the conversational reply
          setChatMessages(prev => prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, content: chatReplyContent, isStreaming: true }
              : msg
          ));
          // isModifying stays true until socket event arrives
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to queue code modification');
        }
      } else if (isCodeModification && generatedCode && !projectId) {
        // Fallback to direct modify-code route if no projectId (shouldn't happen normally)
        const response = await fetch('/api/modify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentCode: generatedCode,
            instruction: userText,
            codeType: settings.codeType,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.modifiedCode) {
            useProjectStore.getState().setGeneratedCode(data.modifiedCode);
            
            setChatMessages(prev => prev.map(msg => 
              msg.id === aiMessageId 
                ? { ...msg, content: `Done! I've updated the code based on your request. Check the preview to see the changes!`, isStreaming: false }
                : msg
            ));
            
            setActiveTab('preview');
          } else {
            throw new Error(data.error || 'Failed to modify code');
          }
        } else {
          throw new Error('Failed to connect to the server');
        }
        setIsModifying(false);
      } else {
        // General chat - call the chat API
        // Save user message to database if we have a projectId
        if (projectId) {
          fetch(API_ENDPOINTS.addChatMessage(projectId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'user', content: userText }),
          }).catch(err => console.error('Failed to save user message:', err));
        }

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: userText,
            context: generatedCode ? 'User has generated code and is viewing the workspace.' : 'User is chatting.'
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const aiResponse = data.response || 'You\'re welcome! Let me know if you need anything.';
          
          setChatMessages(prev => prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, content: aiResponse, isStreaming: false }
              : msg
          ));

          // Save assistant response to database if we have a projectId
          if (projectId) {
            fetch(API_ENDPOINTS.addChatMessage(projectId), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'assistant', content: aiResponse }),
            }).catch(err => console.error('Failed to save assistant message:', err));
          }
        } else {
          throw new Error('Failed to get response');
        }
        setIsModifying(false);
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong';
      setChatMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, content: `Sorry, I couldn't apply that change: ${errorMessage}. Please try again.`, isStreaming: false }
          : msg
      ));
      // BUG FIX: Clear both ref and state on error
      pendingModifyRef.current = null;
      setPendingAiMessageId(null);
      setIsModifying(false);
    }
  };

  // Handle quick action suggestions
  const handleQuickAction = (action: string) => {
    setChatInput(action);
  };

  if (!showWorkspace) {
    return null;
  }

  // Theme classes - using dark theme
  const themeClasses = {
    container: '',
    panel: 'bg-black/40 border-white/10',
    panelSolid: 'bg-black/60',
    text: 'text-white',
    textMuted: 'text-white/60',
    border: 'border-white/10',
    hover: 'hover:bg-white/10',
    input: 'bg-black/30 border-white/10 text-white placeholder-white/40',
  };

  return (
    <div className={`flex h-screen overflow-hidden relative animate-fadeIn ${themeClasses.container}`}>
      {/* Geometric Background */}
      <div className="geometric-bg" />
      
      {/* LEFT PANEL - AI Chat Assistant */}
      <div 
        className={`${isChatCollapsed ? 'w-16' : 'w-[380px]'} flex-shrink-0 ${themeClasses.panel} backdrop-blur-xl border-r ${themeClasses.border} flex flex-col transition-all duration-300 ease-out relative z-10`}
      >
        {isChatCollapsed ? (
          /* Collapsed Chat Bar */
          <div className="flex flex-col h-full items-center py-4">
            <button
              onClick={() => setIsChatCollapsed(false)}
              className={`p-3 ${themeClasses.hover} rounded-lg transition-colors ${themeClasses.textMuted} hover:${themeClasses.text}`}
              title="Expand chat"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <MessageSquare className={`w-5 h-5 ${themeClasses.textMuted}`} />
              <div className="w-px h-8 bg-white/10" />
              <Sparkles className={`w-5 h-5 ${themeClasses.textMuted}`} />
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className={`px-5 py-4 border-b ${themeClasses.border} bg-black/30`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white rounded-xl shadow-lg flex items-center justify-center hover-scale transition-transform duration-300 cursor-pointer animate-float">
                    <span className="text-black font-bold text-lg">N</span>
                  </div>
                  <div className="animate-slideIn">
                    <h2 className={`text-sm font-semibold ${themeClasses.text}`}>NEURON AI</h2>
                    <p className={`text-xs ${themeClasses.textMuted}`}>Chat & modify code</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsChatCollapsed(true)}
                  className={`p-1.5 ${themeClasses.hover} rounded transition-all duration-200 ${themeClasses.textMuted} hover-scale`}
                  title="Collapse chat"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-breathe shadow-lg shadow-green-400/50" />
                <span className="text-xs text-green-400 font-medium">Online</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className={`px-4 py-3 border-b ${themeClasses.border} bg-black/20`}>
              <p className={`text-[10px] ${themeClasses.textMuted} uppercase tracking-wider mb-2`}>Quick Changes</p>
              <div className="flex flex-wrap gap-1.5">
                {['Change the colors', 'Add hover effects', 'Make it responsive', 'Add animations'].map((action, index) => (
                  <button
                    key={action}
                    onClick={() => handleQuickAction(action)}
                    className="px-2.5 py-1 text-[11px] bg-white/10 hover:bg-white/20 text-white/70 hover:text-white border-white/10 hover:border-white/20 rounded-md transition-all duration-200 border backdrop-blur-sm hover-scale animate-fadeIn"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thumb-white/10 scrollbar-thin scrollbar-track-transparent">
              {/* BUG FIX: Show loading indicator while fetching chat history */}
              {isLoadingHistory ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className={`w-6 h-6 animate-spin ${themeClasses.textMuted}`} />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className={`text-center py-8 ${themeClasses.textMuted}`}>
                  <p className="text-sm">No messages yet. Start chatting!</p>
                </div>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-message`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-3 transition-all duration-300 hover-lift ${
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20'
                          : 'bg-black/30 text-white border border-white/10 backdrop-blur-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        {message.role === 'ai' && <Sparkles className="w-3 h-3 text-blue-400" />}
                        <span className={`text-[10px] font-medium ${message.role === 'user' ? 'opacity-70' : themeClasses.textMuted} uppercase tracking-wider`}>
                          {message.role === 'user' ? 'You' : 'NEURON'}
                        </span>
                        <span className={`text-[10px] ${message.role === 'user' ? 'opacity-40' : themeClasses.textMuted}`}>
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {message.isStreaming ? (
                          <span className="flex items-center gap-1.5">
                            <span className="flex gap-1">
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-typing-1"></span>
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-typing-2"></span>
                              <span className="w-2 h-2 bg-blue-400 rounded-full animate-typing-3"></span>
                            </span>
                            <span className="ml-1">Thinking...</span>
                          </span>
                        ) : message.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className={`p-4 border-t ${themeClasses.border} bg-black/30`}>
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Chat or say 'change...' to modify code"
                    className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none transition-all`}
                    rows={2}
                    disabled={isModifying}
                  />
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isModifying}
                  className="p-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover-scale active:scale-95"
                  title="Send message"
                >
                  {isModifying ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  )}
                </button>
              </div>
              <p className={`text-[10px] ${themeClasses.textMuted} text-center mt-2`}>
                Press <kbd className="px-1 py-0.5 bg-white/10 text-white/50 rounded">Enter</kbd> to send
              </p>
            </div>
          </>
        )}
      </div>

      {/* RIGHT PANEL - Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top Bar */}
        <div className={`h-16 border-b ${themeClasses.border} bg-black/40 backdrop-blur-xl flex items-center justify-between px-6`}>
          {/* Left: Project Info + Tabs */}
          <div className="flex items-center gap-6">
            <div>
              <h1 className={`text-lg font-bold ${themeClasses.text}`}>Image to Code Layout</h1>
              <p className={`text-xs ${themeClasses.textMuted}`}>Generated by NEURON</p>
            </div>
            
            {/* Code/Preview Tab Switcher */}
            <div className="inline-flex items-center bg-black/30 rounded-lg p-1 backdrop-blur-sm">
              <button
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                  activeTab === 'code' ? 'bg-white text-black' : themeClasses.textMuted
                }`}
              >
                <Code2 className="w-4 h-4" />
                Code
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                  activeTab === 'preview' ? 'bg-white text-black' : themeClasses.textMuted
                }`}
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors backdrop-blur-sm"
              title="Save project"
            >
              <Save className="w-4 h-4" />
              <span className="hidden md:inline">Save</span>
            </button>
            
            <button
              onClick={handleCopyCode}
              disabled={!generatedCode}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="hidden md:inline">{copied ? 'Copied!' : 'Copy Code'}</span>
            </button>
            
            <button
              onClick={handleDownload}
              disabled={!generatedCode}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span className="hidden md:inline">Download</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden p-6">
          {activeTab === 'code' ? (
            /* CODE VIEW */
            <div className="h-full flex flex-col bg-black/50 border-white/10 backdrop-blur-xl rounded-2xl border overflow-hidden">
              {/* Code Editor with Tabs */}
              <CodeViewerWithTabs />
              
              {/* Status Bar */}
              <div className={`flex items-center justify-between px-4 py-2 border-t ${themeClasses.border} bg-black/30 text-xs`}>
                <div className={`flex items-center gap-4 ${themeClasses.textMuted}`}>
                  <span>{settings.codeType}</span>
                  <span>•</span>
                  <span>Tailwind</span>
                  <span>•</span>
                  <span className={themeClasses.text}>Auto-saved</span>
                </div>
                <div className={themeClasses.textMuted}>
                  NEURON AI
                </div>
              </div>
            </div>
          ) : (
            /* PREVIEW VIEW */
            <div className="h-full flex flex-col relative">
              {/* Loading Overlay for Modifications */}
              {isModifying && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-2xl">
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-blue-500/30 rounded-full"></div>
                      <div className="w-16 h-16 border-4 border-transparent border-t-blue-500 rounded-full animate-spin absolute inset-0"></div>
                    </div>
                    <div className="text-white text-center">
                      <p className="font-semibold">Applying Changes...</p>
                      <p className="text-sm text-white/60">Preview will update automatically</p>
                    </div>
                  </div>
                </div>
              )}
              {/* Preview Toolbar */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="flex items-center bg-black/50 border-white/10 backdrop-blur-xl rounded-lg p-1 border">
                  <button
                    onClick={() => setViewport('desktop')}
                    className={`p-2 rounded transition-all ${
                      viewport === 'desktop' ? 'bg-white/10 text-white' : themeClasses.textMuted
                    }`}
                    title="Desktop view"
                  >
                    <Monitor className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewport('tablet')}
                    className={`p-2 rounded transition-all ${
                      viewport === 'tablet' ? 'bg-white/10 text-white' : themeClasses.textMuted
                    }`}
                    title="Tablet view"
                  >
                    <Tablet className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewport('mobile')}
                    className={`p-2 rounded transition-all ${
                      viewport === 'mobile' ? 'bg-white/10 text-white' : themeClasses.textMuted
                    }`}
                    title="Mobile view"
                  >
                    <Smartphone className="w-4 h-4" />
                  </button>
                </div>
                
                {/* Inspector Toggle */}
                <button
                  onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                    isInspectorOpen 
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
                      : 'bg-black/50 border-white/10 text-white/60 hover:text-white hover:border-white/20'
                  }`}
                  title="Toggle Inspector"
                >
                  <Layers className="w-4 h-4" />
                  <span className="text-xs font-medium">Inspector</span>
                </button>
              </div>
              
              {/* Browser Frame */}
              <div className="flex-1 flex overflow-hidden gap-4">
                {/* Preview Container */}
                <div className={`flex-1 flex flex-col backdrop-blur-xl rounded-2xl border overflow-hidden bg-black/50 border-white/10 transition-all duration-300 ${isInspectorOpen ? 'mr-0' : ''}`}>
                  {/* Browser Chrome */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-black/30">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-white/20" />
                      <div className="w-3 h-3 rounded-full bg-white/20" />
                      <div className="w-3 h-3 rounded-full bg-white/20" />
                    </div>
                    <div className="flex-1 px-4 py-1.5 rounded-lg text-xs text-center bg-white/5 text-white/50">
                      localhost:3000
                    </div>
                  </div>
                  
                  {/* Preview Content */}
                  <div className="flex-1 overflow-hidden">
                    <LivePreview 
                      code={generatedCode} 
                      status={status} 
                      codeType={settings.codeType}
                      onElementSelect={isInspectorOpen ? (elementInfo) => setSelectedElement(elementInfo) : undefined}
                    />
                  </div>
                </div>
                
                {/* Inspector Panel */}
                {isInspectorOpen && (
                  <div className="w-[300px] flex-shrink-0 rounded-2xl overflow-hidden">
                    <InspectorPanel
                      projectId={projectId}
                      selectedElement={selectedElement}
                      onClose={() => setIsInspectorOpen(false)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
