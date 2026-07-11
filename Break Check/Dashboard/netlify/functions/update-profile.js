exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'PATCH' && event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { id, full_name, initials, hex_color } = JSON.parse(event.body || '{}');

        if (!id) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing profile id' }) };
        }

        const payload = {};
        if (full_name !== undefined) payload.full_name = full_name;
        if (initials !== undefined) payload.initials = initials;
        if (hex_color !== undefined) payload.hex_color = hex_color;

        const url = `${process.env.SUPABASE_URL}/rest/v1/team_profiles?id=eq.${encodeURIComponent(id)}`;

        const res = await fetch(url, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(payload)
        });

        const text = await res.text();

        if (!res.ok) {
            throw new Error(`Supabase error ${res.status}: ${text}`);
        }

        // Supabase silently returns [] when RLS blocks UPDATE — detect and report it
        let updated;
        try { updated = JSON.parse(text); } catch(_) { updated = []; }

        if (!Array.isArray(updated) || updated.length === 0) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({
                    error: 'RLS_BLOCKED',
                    details: 'Supabase Row Level Security is blocking this update. Run supabase_rls_fix.sql in your Supabase SQL Editor to add the missing UPDATE policy.',
                    sql_file: 'Break Check/Dashboard/supabase_rls_fix.sql'
                })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, updated: updated[0] })
        };
    } catch (err) {
        console.error('update-profile error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error', details: err.message })
        };
    }
};
