exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { id } = JSON.parse(event.body || '{}');

        if (!id) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing profile id' }) };
        }

        const url = `${process.env.SUPABASE_URL}/rest/v1/team_profiles?id=eq.${encodeURIComponent(id)}`;

        const res = await fetch(url, {
            method: 'DELETE',
            headers: {
                'apikey': process.env.SUPABASE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
                'Prefer': 'return=minimal'
            }
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Supabase error ${res.status}: ${errText}`);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true })
        };
    } catch (err) {
        console.error('delete-profile error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error', details: err.message })
        };
    }
};
