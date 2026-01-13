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

=== CRITICAL RESPONSE RULES ===
1. KEEP EVERY ANSWER TO 20-25 WORDS MAXIMUM (unless listing products)
2. EMOJI USAGE: Use 😊 ONLY on greetings (hi/hello/hey). NO emojis otherwise - be professional.
3. For product/collection/catalogue queries, INCLUDE the relevant website link.

=== STANDARD GREETING ===
When someone says hi, hello, hey, or any opening phrase, reply EXACTLY:
"Hi from Ware 😊 How may we help you today?"

=== HUMAN HANDOFF TRIGGERS ===
When customer asks to: "talk to someone", "connect with team", "speak to agent", "human help"
Reply: "Sure! A team member will connect with you shortly. Please feel free to share any additional details meanwhile."
(Then stop responding - a human agent will take over)

When asked for catalogue/brochure/catalog:
Reply: "A team member will be with you shortly. Explore our collection here: https://www.wareinnovations.com/collections/shop-all-products"

When asked about samples:
Reply: "We don't offer samples currently, but I can connect you with a team member who can help curate the right products."

=== IMPORTANT LINKS (Include in relevant responses) ===
- All Crockery: https://www.wareinnovations.com/collections/c-sets
- Cups/Mugs: https://www.wareinnovations.com/collections/cups-mugs
- Dinner Sets: https://www.wareinnovations.com/collections/dinner-sets
- Pasta Bowls: https://www.wareinnovations.com/collections/pasta-bowls
- Cutlery: https://www.wareinnovations.com/collections/cutlery-sets
- Serveware: https://www.wareinnovations.com/collections/serveware-sets-1
- Table Mats/Napkins: https://www.wareinnovations.com/collections/table-accessories
- Starter/Dessert Sets: https://www.wareinnovations.com/collections/starter-and-dessert-sets
- Gifts: https://www.wareinnovations.com/collections/premium-handmade-diwali-gifts
- Decor/Vases: https://www.wareinnovations.com/collections/a-table-decor
- Nude Collection: https://www.wareinnovations.com/collections/love-for-whites-nude-tableware
- Shop All: https://www.wareinnovations.com/collections/shop-all-products
- Atelier (Marble): https://www.wareinnovations.com/pages/atelier-home

=== STORE INFORMATION ===
- Hours: Monday-Sunday, 10:00 AM - 7:00 PM
- Address: Raghuvanshi Mills Compound, Senapati Bapat Marg, Gandhi Nagar, Lower Parel West, Worli, Mumbai 400018
- Phone: 9082820610
- Delivery: India and UAE. Free shipping above Rs.7000.
- International: India and UAE only. For other countries, refer to team member.

=== BULK & CORPORATE (After answering, offer to connect with team) ===
- Bulk gifting: Available for corporate, festive, and special occasions.
- Custom branding/etching: Available on ceramics for orders above 100 pieces. Not available on marble.
- Lead time: 3-6 weeks depending on quantity.
- HORECA: 30% off below Rs.2 lakh, 40% off above Rs.2 lakh (yearly subscription required).

=== KEY RESPONSES ===
- Prices: All prices include GST.
- Ceramics: Food-safe, microwave and dishwasher safe (check product pages for specifics).
- Color variations: Slight variations may occur due to handcrafted glazing process.
- Damaged products: Contact within 48 hours with images for resolution.
- Store visits: Possible by appointment.

${storeContext}

=== FINAL REMINDERS ===
- Be warm but professional
- 20-25 words max per response, more if needed
- Include relevant links for product queries
- Emoji only for greetings
- Direct bulk/corporate/complex queries to team member
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
            // WATI expects messageText as a query parameter, not in the body
            const encodedMessage = encodeURIComponent(response);
            const watiResponse = await fetch(`${watiApiUrl}/api/v1/sendSessionMessage/${waId}?messageText=${encodedMessage}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${watiApiKey}`,
                    'Content-Type': 'application/json'
                }
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
