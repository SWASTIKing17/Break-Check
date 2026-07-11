-- ============================================================
-- FreeXan Break Check — Supabase Schema Migration v2
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- Project: toidowlqmqbmtrfjvzgt
-- ============================================================

-- 1. Convert timestamp TEXT → TIMESTAMPTZ for native time-series indexing
ALTER TABLE public.admin_events
  ALTER COLUMN timestamp TYPE TIMESTAMPTZ
  USING timestamp::TIMESTAMPTZ;

-- 2. Add composite index for fast per-employee queries (descending for recent-first)
CREATE INDEX IF NOT EXISTS idx_admin_events_employee_ts
  ON public.admin_events (employee_id, timestamp DESC);

-- 3. Add single-column index for date-range scans across all employees
CREATE INDEX IF NOT EXISTS idx_admin_events_ts
  ON public.admin_events (timestamp DESC);

-- 4. Server-Side Aggregation RPC — returns pre-computed dashboard stats
--    This replaces the 20,000-row client-side fetch + JS bucketing.
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_employee_id TEXT DEFAULT NULL,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  result JSON;
  day_start TIMESTAMPTZ;
  day_end   TIMESTAMPTZ;
BEGIN
  day_start := p_date::TIMESTAMPTZ;
  day_end   := (p_date + INTERVAL '1 day')::TIMESTAMPTZ;

  WITH filtered AS (
    SELECT *
    FROM admin_events
    WHERE timestamp >= day_start
      AND timestamp <  day_end
      AND (p_employee_id IS NULL OR employee_id = p_employee_id)
  ),

  -- KPI: total events, total keystrokes, total scroll
  kpis AS (
    SELECT
      COUNT(*)                                      AS total_events,
      COALESCE(SUM(keystrokes), 0)                  AS total_keystrokes,
      COALESCE(SUM(scroll_distance), 0)             AS total_scroll,
      COUNT(DISTINCT DATE_TRUNC('minute', timestamp)) AS active_minutes,
      -- modifier ratio
      COUNT(*) FILTER (WHERE event_type = 'keystrokes' AND keystrokes > 0) AS keystroke_bursts,
      COUNT(*) FILTER (WHERE modifier_keys = 1)      AS modifier_bursts
    FROM filtered
  ),

  -- Per-minute buckets for Activity Flow chart
  minute_buckets AS (
    SELECT
      DATE_TRUNC('minute', timestamp)           AS minute_ts,
      COALESCE(SUM(keystrokes), 0)              AS keys,
      COUNT(*) FILTER (WHERE event_type = 'cursor') AS cursor_events,
      COALESCE(SUM(scroll_distance), 0)         AS scroll,
      -- Dominant app: most frequent active_window simplified app per minute
      MODE() WITHIN GROUP (ORDER BY active_window) AS dominant_window,
      -- RAM
      MAX(ram_usage_gb)                         AS max_ram,
      MAX(ram_total_gb)                         AS max_ram_total
    FROM filtered
    GROUP BY DATE_TRUNC('minute', timestamp)
    ORDER BY minute_ts
  ),

  -- App distribution (simplified on client, raw here)
  app_dist AS (
    SELECT active_window, COUNT(*) AS cnt
    FROM filtered
    WHERE active_window IS NOT NULL AND active_window != ''
    GROUP BY active_window
    ORDER BY cnt DESC
    LIMIT 10
  ),

  -- RAM timeline
  ram_timeline AS (
    SELECT
      DATE_TRUNC('minute', timestamp) AS minute_ts,
      AVG(ram_usage_gb)               AS avg_ram,
      MAX(ram_usage_gb)               AS peak_ram,
      MAX(ram_total_gb)               AS ram_total
    FROM filtered
    WHERE ram_usage_gb > 0
    GROUP BY DATE_TRUNC('minute', timestamp)
    ORDER BY minute_ts
  ),

  -- Tracked hours span
  time_span AS (
    SELECT
      MIN(timestamp) AS first_event,
      MAX(timestamp) AS last_event,
      EXTRACT(EPOCH FROM MAX(timestamp) - MIN(timestamp)) / 3600.0 AS tracked_hours
    FROM filtered
  )

  SELECT json_build_object(
    'kpis', (SELECT row_to_json(k) FROM kpis k),
    'minute_buckets', (SELECT json_agg(row_to_json(mb)) FROM minute_buckets mb),
    'app_distribution', (SELECT json_agg(row_to_json(ad)) FROM app_dist ad),
    'ram_timeline', (SELECT json_agg(row_to_json(rt)) FROM ram_timeline rt),
    'time_span', (SELECT row_to_json(ts) FROM time_span ts)
  ) INTO result;

  RETURN result;
END;
$$;

-- 5. Verify the function exists
SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'get_dashboard_stats';
