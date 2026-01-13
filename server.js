import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { storeContext } from './storeContext.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Groq AI
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// System prompt for the chatbot
const systemPrompt = `You are a friendly customer service assistant for Ware Innovations, a premium handcrafted tableware brand.

IMPORTANT: Keep responses SHORT and CONCISE. Maximum 2-3 sentences unless listing products.

Your job is to:
1. Answer questions about products and prices
2. Help with shipping/return inquiries
3. Be warm but brief

Here is everything you know about the store:

${storeContext}

Guidelines:
- Keep responses to 2-3 sentences max
- Only list products if specifically asked
- Use bullet points for product lists (max 5 items, then say "and more...")
- No lengthy introductions or conclusions
- Be direct and helpful
- Use 1-2 emojis max per response
`;

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, chatHistory = [] } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Build messages array for Groq
        const messages = [
            { role: 'system', content: systemPrompt },
            ...chatHistory.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            })),
            { role: 'user', content: message }
        ];

        // Generate response from Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
            max_tokens: 1024
        });

        const response = chatCompletion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

        res.json({
            message: response,
            success: true
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({
            error: 'Failed to generate response. Please check your API key.',
            details: error.message
        });
    }
});

// WATI WhatsApp webhook endpoint
app.post('/api/wati', async (req, res) => {
    try {
        // WATI sends message data in the request body
        const { waId, text, senderName } = req.body;

        if (!text) {
            return res.status(200).json({ success: true }); // Acknowledge but skip
        }

        console.log(`WhatsApp message from ${senderName} (${waId}): ${text}`);

        // KEYWORD FILTERING - Only respond to specific trigger words
        const triggerKeywords = ['test-bot', 'testbot', 'ai-help'];
        const lowerText = text.toLowerCase().trim();
        const isTriggered = triggerKeywords.some(keyword => lowerText.includes(keyword));

        if (!isTriggered) {
            console.log('Message ignored - no trigger keyword found');
            return res.status(200).json({ success: true, skipped: true });
        }

        // Remove the trigger keyword from the message for AI processing
        let userQuery = lowerText;
        triggerKeywords.forEach(keyword => {
            userQuery = userQuery.replace(keyword, '').trim();
        });

        // If only the keyword was sent, send a greeting
        if (!userQuery) {
            userQuery = 'Hello! What can you help me with?';
        }

        // Build messages for AI
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userQuery }
        ];

        // Generate response from Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
            max_tokens: 500 // Shorter for WhatsApp
        });

        const response = chatCompletion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

        // Send response back via WATI API
        const watiApiUrl = process.env.WATI_API_URL;
        const watiApiKey = process.env.WATI_API_KEY;

        if (watiApiUrl && watiApiKey) {
            const watiResponse = await fetch(`${watiApiUrl}/api/v1/sendSessionMessage/${waId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${watiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ messageText: response })
            });
            const watiResult = await watiResponse.json();
            console.log('WATI API Status:', watiResponse.status);
            console.log('WATI API Response:', JSON.stringify(watiResult));
            if (watiResponse.ok) {
                console.log('Response sent to WhatsApp successfully!');
            } else {
                console.error('WATI API Error:', watiResult);
            }
        } else {
            console.error('Missing WATI credentials - WATI_API_URL or WATI_API_KEY not set');
        }

        res.status(200).json({ success: true, response });

    } catch (error) {
        console.error('WATI webhook error:', error);
        res.status(200).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running!' });
});

// Start server
app.listen(PORT, () => {
    console.log('====================================');
    console.log('  Ware Innovations Chatbot Started! ');
    console.log('====================================');
    console.log('  Server running on port: ' + PORT);
    console.log('  API endpoint: http://localhost:' + PORT + '/api/chat');
    console.log('  Using: Groq AI (Llama 3.3 70B)');
    console.log('====================================');
});
