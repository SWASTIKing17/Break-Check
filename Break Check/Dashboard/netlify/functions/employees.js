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
        let allEmployees = new Set();
        let offset = 0;
        const limit = 1000; // Supabase default max_rows limit

        while (true) {
            const url = `${process.env.SUPABASE_URL}/rest/v1/admin_events?select=employee_id&limit=${limit}&offset=${offset}`;
            
            const res = await fetch(url, {
                headers: {
                    'apikey': process.env.SUPABASE_KEY,
                    'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
                }
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Supabase error: ${errText}`);
            }

            const data = await res.json();
            
            if (data.length === 0) break;
            
            data.forEach(d => {
                if (d.employee_id) allEmployees.add(d.employee_id);
            });

            if (data.length < limit) break;
            
            offset += limit;
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: [...allEmployees] })
        };
    } catch (err) {
        console.error("Employee data error:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error', details: err.message }) };
    }
};
