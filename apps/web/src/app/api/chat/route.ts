 import { NextRequest, NextResponse } from 'next/server';
 
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_PROMPT = `You are NEURON, a helpful and friendly AI assistant. You're part of an image-to-code conversion tool, but you can chat about anything!

Personality:
- Be friendly, helpful, and conversational
- Keep responses concise but informative (2-4 sentences usually)
- Use casual language, be personable
- If asked about yourself, say you're NEURON AI

About the NEURON tool:
- Converts images/screenshots to production-ready code
- Supports React, HTML, Vue, Svelte, Next.js
- Uses Tailwind CSS for styling
- Users can chat with you to modify the generated code

If someone wants to modify code, tell them to use words like "change", "modify", "add", "remove", "update" in their message.`;

// Smart fallback responses based on user message type
function getFallbackResponse(message: string): string {
  const lowerMessage = message.toLowerCase().trim();
  
  // Greetings
  if (/^(hi|hello|hey|howdy|hola|greetings|good\s*(morning|afternoon|evening|day)|sup|what'?s\s*up|yo)\b/i.test(lowerMessage)) {
    const greetings = [
      "Hey there! 👋 I'm NEURON, your AI coding assistant. How can I help you today?",
      "Hello! Great to see you! I'm here to help with your code. What would you like to do?",
      "Hi! 😊 Welcome! Feel free to ask me anything or tell me to modify your code.",
      "Hey! I'm NEURON, ready to assist. What can I do for you?",
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  // Thanks/Gratitude
  if (/\b(thanks?|thank\s*you|thx|ty|appreciate|grateful)\b/i.test(lowerMessage)) {
    const thanks = [
      "You're welcome! 😊 Let me know if you need anything else!",
      "Happy to help! Feel free to ask if you have more questions.",
      "Anytime! I'm here whenever you need assistance.",
      "Glad I could help! Don't hesitate to reach out again.",
    ];
    return thanks[Math.floor(Math.random() * thanks.length)];
  }
  
  // How are you / What's up
  if (/\b(how\s*(are|r)\s*(you|u)|how'?s\s*it\s*going|what'?s\s*(up|new)|how\s*do\s*you\s*do)\b/i.test(lowerMessage)) {
    return "I'm doing great, thanks for asking! 😄 Ready to help you with your code. What would you like to work on?";
  }
  
  // Goodbye/Bye
  if (/\b(bye|goodbye|see\s*(you|ya)|later|cya|gtg|gotta\s*go|take\s*care)\b/i.test(lowerMessage)) {
    const goodbyes = [
      "Goodbye! Have a great day! 👋",
      "See you later! Come back anytime you need help!",
      "Take care! Happy coding! 🚀",
      "Bye! It was nice chatting with you!",
    ];
    return goodbyes[Math.floor(Math.random() * goodbyes.length)];
  }
  
  // Who are you / What are you
  if (/\b(who\s*(are|r)\s*(you|u)|what\s*(are|r)\s*(you|u)|your\s*name|introduce\s*yourself)\b/i.test(lowerMessage)) {
    return "I'm NEURON, your AI-powered coding assistant! 🤖 I help convert images to code and can modify your generated code based on your instructions. Just describe what you'd like to change!";
  }
  
  // Help
  if (/^(help|what\s*can\s*you\s*do|how\s*does\s*this\s*work)\b/i.test(lowerMessage)) {
    return "I can help you modify your generated code! Just describe what you want to change - like 'change the background to blue' or 'add a contact form'. I'll handle the rest! 💡";
  }
  
  // Yes/No/Ok acknowledgments
  if (/^(ok|okay|sure|yes|yeah|yep|no|nope|nah|alright|got\s*it|understood)\b/i.test(lowerMessage)) {
    return "Got it! Let me know if there's anything else I can help you with. 😊";
  }
  
  // Default fallback
  return "I'm here to help! You can ask me anything or use words like 'change', 'modify', or 'add' to edit your code.";
}

export async function POST(req: NextRequest) {
  try {
    const { message, context } = await req.json();

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      
      const chat = model.startChat({
        history: [
          {
            role: 'user',
            parts: [{ text: SYSTEM_PROMPT }],
          },
          {
            role: 'model',
            parts: [{ text: 'Got it! I\'m NEURON, ready to chat and help out. What\'s on your mind?' }],
          },
        ],
      });

      const fullMessage = context ? `[Context: ${context}]\n\nUser: ${message}` : message;
      const result = await chat.sendMessage(fullMessage);
      const response = result.response.text();

      return NextResponse.json({
        success: true,
        response,
      });
    } catch (aiError) {
      console.warn('AI API error:', aiError);
      // Use smart fallback based on user message
      return NextResponse.json({
        success: true,
        response: getFallbackResponse(message),
      });
    }
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process message' },
      { status: 500 }
    );
  }
}
