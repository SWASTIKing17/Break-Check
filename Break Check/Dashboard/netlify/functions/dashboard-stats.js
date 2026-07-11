/**
 * Netlify Function: /api/dashboard-stats
 * Calls the Supabase RPC `get_dashboard_stats` to return pre-aggregated
 * dashboard data instead of raw rows. Reduces payload from MBs to KBs.
 */
exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const employeeId = event.queryStringParameters?.employee_id || null;
        const date = event.queryStringParameters?.date || new Date().toISOString().split('T')[0];

        const rpcUrl = `${process.env.SUPABASE_URL}/rest/v1/rpc/get_dashboard_stats`;

        const res = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                p_employee_id: employeeId,
                p_date: date,
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Supabase RPC error: ${errText}`);
        }

        const data = await res.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data }),
        };
    } catch (err) {
        console.error('Dashboard stats error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error', details: err.message }),
        };
    }
};
