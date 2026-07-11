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
        const employeeId = event.queryStringParameters.employee_id;
        const date = event.queryStringParameters.date || new Date().toISOString().split('T')[0];
        
        // Build timezone-agnostic day boundaries (UTC matches database timestamp storage)
        const dayStart = `${date}T00:00:00.000Z`;
        const dayEnd = `${date}T23:59:59.999Z`;

        const limit = 1000;
        let offset = 0;
        let allData = [];

        while (true) {
            let url = `${process.env.SUPABASE_URL}/rest/v1/admin_events?select=*&order=timestamp.desc&limit=${limit}&offset=${offset}&timestamp=gte.${dayStart}&timestamp=lte.${dayEnd}`;
            if (employeeId) {
                url += `&employee_id=eq.${encodeURIComponent(employeeId)}`;
            }

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

            const chunk = await res.json();
            
            if (chunk.length === 0) break;
            
            allData = allData.concat(chunk);
            
            // Hard cap at 20,000 events to prevent massive payload crashes in browser
            if (chunk.length < limit || allData.length >= 20000) break;
            
            offset += limit;
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: allData })
        };
    } catch (err) {
        console.error("Data error:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal Server Error', details: err.message })
        };
    }
};
