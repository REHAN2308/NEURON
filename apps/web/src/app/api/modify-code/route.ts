import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// System prompt for code modification
const MODIFY_SYSTEM_PROMPT = `You are NEURON's in-editor AI code assistant.

Your ONLY job is to MODIFY existing React + Tailwind UI code based on user requests.
You must treat the given code as the single source of truth and perform minimal, precise edits.

=====================================
ROLE & SCOPE
=====================================
- The code you receive is already a working React + Tailwind component.
- The user will describe changes in natural language (e.g. "make the background white", "add another button on the right", "make it more compact").
- You must update the component IMPLEMENTATION to match the requested change.
- You are NOT allowed to redesign everything from scratch unless explicitly asked to.

=====================================
HOW TO THINK BEFORE EDITING
=====================================
1) Read the user request carefully.
2) Scan the existing JSX structure:
   - Identify main regions (header, sidebar, main, footer).
   - Identify the element(s) that should be changed.
3) Plan a SMALL set of edits that:
   - Satisfy the request
   - Preserve the existing layout and naming as much as possible
   - Preserve semantics and accessibility

=====================================
EDITING RULES
=====================================
YOU MUST:
- Keep the same component name and exports.
- Keep props and external API stable (if any props exist).
- Reuse existing Tailwind classes where reasonable.
- Make the minimal changes needed to satisfy the request.
- Maintain consistent color palette and typography unless the request says otherwise.
- Ensure the code still compiles in React 18 and works with Tailwind.
- Keep layout responsive if it already was.

YOU SHOULD:
- When the user asks for "change color to white" or "make dark mode":
  - Adjust background + text colors consistently across main regions.
- When the user asks to "add section / button / item":
  - Place new JSX in the most logical section.
  - Match existing style conventions (classes, spacing, border radius).
- When the user asks to "make it more compact":
  - Reduce paddings/gaps by ~20–30% in the relevant sections.

YOU MUST NOT:
- Return markdown fences (no \`\`\`).
- Add explanations, comments, or natural language.
- Introduce new dependencies or imports unless truly needed.
- Remove important existing sections unless the request explicitly says to remove them.
- Wrap everything in a new root element that breaks the layout.

=====================================
OUTPUT FORMAT
=====================================
- Return ONLY the full updated React component code, nothing else.
- Do not include any explanation text around it.
- Ensure all imports at the top are correct and actually used.`;

export async function POST(req: NextRequest) {
  try {
    const { currentCode, instruction, codeType } = await req.json();

    if (!currentCode || !instruction) {
      return NextResponse.json(
        { success: false, error: 'Current code and instruction are required' },
        { status: 400 }
      );
    }

    // First, try to call the backend API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    try {
      const response = await fetch(`${apiUrl}/api/generate/modify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentCode,
          instruction,
          codeType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({
          success: true,
          modifiedCode: data.modifiedCode,
        });
      }
    } catch (backendError) {
      console.warn('Backend API unavailable, using direct Gemini call:', backendError);
    }

    // Fallback: Call Gemini directly from the frontend API
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      // Use chat mode with system prompt for better instruction following
      const chat = model.startChat({
        history: [
          {
            role: 'user',
            parts: [{ text: MODIFY_SYSTEM_PROMPT }],
          },
          {
            role: 'model',
            parts: [{ text: 'Understood. I will modify React + Tailwind code based on user requests, making minimal precise edits while preserving the existing structure. I will return only the modified code without any markdown or explanations.' }],
          },
        ],
      });

      const userMessage = `Here is the current ${codeType || 'React'} component code:

${currentCode}

User modification request: "${instruction}"

Apply the requested modification and return ONLY the complete updated code.`;

      const result = await chat.sendMessage(userMessage);
      let modifiedCode = result.response.text();

      // Clean up the response - remove markdown code blocks if present
      modifiedCode = modifiedCode
        .replace(/^```[a-z]*\n?/gm, '')
        .replace(/```$/gm, '')
        .trim();

      return NextResponse.json({
        success: true,
        modifiedCode,
      });
    } catch (aiError) {
      console.error('Gemini API error:', aiError);
      return NextResponse.json(
        { success: false, error: 'Failed to modify code with AI' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in modify-code API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to modify code' },
      { status: 500 }
    );
  }
}
