exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Basic API Key protection
    const apiKey = event.headers['x-api-key'] || event.headers['X-Api-Key'];
    if (process.env.ADMIN_API_KEY && apiKey !== process.env.ADMIN_API_KEY) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    try {
        const payload = JSON.parse(event.body);
        if (!Array.isArray(payload)) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Payload must be an array' }) };
        }

        const clientIp = event.headers['x-forwarded-for'] || 'unknown';

        const rowsToInsert = payload.map(ev => ({
            timestamp: ev.timestamp,
            event_type: ev.event_type || ev.type,
            cursor_x: ev.cursor_x || 0,
            cursor_y: ev.cursor_y || 0,
            keystrokes: ev.keystrokes || 0,
            active_window: ev.active_window || '',
            client_ip: clientIp,
            employee_id: ev.employee_id || 'Unknown',
            ram_usage_gb: ev.ram_usage_gb ?? null,
            scroll_distance: ev.scroll_distance ?? null,
            modifier_keys: ev.modifier_keys ?? null,
            ram_total_gb: ev.ram_total_gb ?? null,
        }));

        const url = `${process.env.SUPABASE_URL}/rest/v1/admin_events`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(rowsToInsert)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Supabase error: ${errText}`);
        }

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({ success: true, count: payload.length })
        };
    } catch (err) {
        console.error("Ingest error:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error', details: err.message })
        };
    }
};
