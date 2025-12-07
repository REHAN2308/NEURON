'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  ImagePlus, 
  Sparkles,
  X,
  Loader2
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachedImage?: string;
}

interface ChatBoxProps {
  onSendMessage: (message: string, image?: File) => void;
  isProcessing?: boolean;
}

export default function ChatBox({ onSendMessage, isProcessing = false }: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setAttachedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = () => {
    if (!input.trim() && !attachedImage) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
      attachedImage: imagePreview || undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    onSendMessage(input.trim(), attachedImage || undefined);
    
    setInput('');
    handleRemoveImage();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-40">
      {/* Messages Area - Only show if there are messages */}
      {messages.length > 0 && (
        <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-2xl rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {message.attachedImage && (
                  <img
                    src={message.attachedImage}
                    alt="Attached"
                    className="max-w-xs rounded mb-2"
                  />
                )}
                <p className="text-sm">{message.content}</p>
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-slate-800 text-slate-300 rounded-lg px-4 py-2 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Processing your request...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input Area */}
      <div className="px-4 py-3">
        {/* Image Preview */}
        {imagePreview && (
          <div className="mb-2 relative inline-block">
            <img
              src={imagePreview}
              alt="Preview"
              className="h-20 rounded-lg border border-slate-700"
            />
            <button
              onClick={handleRemoveImage}
              className="absolute -top-2 -right-2 p-1 bg-slate-800 hover:bg-slate-700 rounded-full border border-slate-700"
            >
              <X className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        )}

        {/* Input Box */}
        <div className="flex items-end gap-2 max-w-5xl mx-auto">
          {/* Image Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Attach image"
          >
            <ImagePlus className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* Text Input */}
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isProcessing}
              placeholder="Ask AI to modify your code... (e.g., 'Change the background color to blue', 'Add a contact form')"
              className="w-full px-4 py-3 pr-12 bg-slate-800 text-slate-300 placeholder-slate-500 rounded-lg border border-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              rows={1}
              style={{ minHeight: '48px', maxHeight: '120px' }}
            />
            <div className="absolute right-3 top-3">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={(!input.trim() && !attachedImage) || isProcessing}
            className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Send message"
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Helper Text */}
        <p className="text-xs text-slate-500 text-center mt-2">
          Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Shift + Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}
