exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY is not set' }) };
        }

        const payload = JSON.parse(event.body);
        const { messages, contextData } = payload;

        let systemText = "You are an AI assistant for the Break Check Dashboard. You analyze editor productivity and hardware usage, specifically for Adobe Premiere Pro editors. Answer the user's questions clearly and concisely, referring to the context data provided. Point out productivity bottlenecks, friction points, or RAM constraints if you see them.";
        if (contextData) {
            systemText += "\n\n--- CURRENT DASHBOARD CONTEXT ---\n";
            systemText += JSON.stringify(contextData, null, 2);
            systemText += "\n----------------------------------\n";
        }

        const geminiMessages = messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        const requestBody = {
            systemInstruction: {
                parts: [{ text: systemText }]
            },
            contents: geminiMessages
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Gemini API Error:", data);
            return { statusCode: response.status, headers, body: JSON.stringify({ error: data.error?.message || 'Error from Gemini API' }) };
        }

        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ reply: replyText })
        };
    } catch (err) {
        console.error("Chat function error:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error', details: err.message }) };
    }
};
