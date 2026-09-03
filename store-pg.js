// store-pg.js — Postgres pool + boot-time schema. Single source of truth for everything the app does.
//
// Convention (carried from AnotherStoryBLDR): init() runs CREATE TABLE IF NOT EXISTS for every table and
// ALTER TABLE ... ADD COLUMN IF NOT EXISTS for additive changes. Never a destructive statement here.
// migrate.js runs the same init() from the shell so dev can apply schema without booting the server.
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[store-pg] DATABASE_URL is not set — refusing to boot without a database.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Replit's built-in Postgres (Neon) needs TLS; a local dev URL does not.
  ssl: /neon\.tech|replit|render\.com|amazonaws\.com|sslmode=require/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
});

const DDL = [
  // ---- tenancy ---------------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS tenants (
    id text PRIMARY KEY, slug text UNIQUE NOT NULL, hostnames text[] NOT NULL DEFAULT '{}',
    name text NOT NULL, quote_to_email text, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS site_config (
    tenant_id text NOT NULL REFERENCES tenants(id), key text NOT NULL, value jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, key))`,

  // ---- catalog (SSC hierarchy: material line -> style -> grade -> variant) ----------------------
  `CREATE TABLE IF NOT EXISTS material_lines (
    id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), slug text NOT NULL, name text NOT NULL,
    sort integer NOT NULL DEFAULT 0, UNIQUE (tenant_id, slug))`,
  `CREATE TABLE IF NOT EXISTS styles (
    id text PRIMARY KEY, slug text UNIQUE NOT NULL, name text NOT NULL,
    assemble_template text NOT NULL, sort integer NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS grades (
    id text PRIMARY KEY, style_id text NOT NULL REFERENCES styles(id), slug text NOT NULL, name text NOT NULL,
    UNIQUE (style_id, slug))`,
  `CREATE TABLE IF NOT EXISTS variants (
    id text PRIMARY KEY, grade_id text NOT NULL REFERENCES grades(id),
    material_line_id text NOT NULL REFERENCES material_lines(id), slug text NOT NULL, name text NOT NULL,
    sections integer NOT NULL DEFAULT 1, center_rail text, control_rods boolean NOT NULL DEFAULT false,
    louver_size text, renderable boolean NOT NULL DEFAULT true, attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (grade_id, material_line_id, slug))`,
  `CREATE TABLE IF NOT EXISTS colors (
    id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), slug text NOT NULL, name text NOT NULL,
    hex text NOT NULL, finish text, UNIQUE (tenant_id, slug))`,
  `CREATE TABLE IF NOT EXISTS assets (
    id text PRIMARY KEY, variant_id text REFERENCES variants(id), color_id text REFERENCES colors(id),
    kind text NOT NULL CHECK (kind IN ('product_front','lifestyle','detail')),
    cloudinary_public_id text NOT NULL, secure_url text, width integer, height integer,
    is_reference boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS sizing_rules (
    id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), style_id text REFERENCES styles(id),
    min_w numeric NOT NULL, max_w numeric NOT NULL, min_h numeric NOT NULL, max_h numeric NOT NULL,
    w_increment numeric NOT NULL DEFAULT 0.25, h_increment numeric NOT NULL DEFAULT 0.25,
    width_rule jsonb NOT NULL DEFAULT '{}'::jsonb, confirmed_by_ssc boolean NOT NULL DEFAULT false)`,

  // ---- funnel ------------------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS sessions (
    id uuid PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id), address text NOT NULL,
    lat double precision, lng double precision, place_id text, source text NOT NULL DEFAULT 'streetview',
    status text NOT NULL DEFAULT 'created', error text, style_id text, material_line_id text, color_id text,
    embed_origin text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS streetview_shots (
    id text PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id), heading numeric, pitch numeric,
    fov numeric, pano_id text, cloudinary_public_id text, secure_url text, score numeric,
    chosen boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS assessments (
    id text PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id), shot_id text REFERENCES streetview_shots(id),
    model text, prompt_version text, json jsonb NOT NULL, scale_in_per_px numeric, scale_source text,
    confidence numeric, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS openings (
    id text PRIMARY KEY, assessment_id text NOT NULL REFERENCES assessments(id), kind text NOT NULL,
    bbox jsonb NOT NULL, est_w_in numeric, est_h_in numeric, story integer, shape text NOT NULL DEFAULT 'rect',
    has_existing_shutters boolean NOT NULL DEFAULT false, include boolean NOT NULL DEFAULT true, flag text)`,
  `CREATE TABLE IF NOT EXISTS boms (
    id text PRIMARY KEY, assessment_id text NOT NULL REFERENCES assessments(id), style_id text REFERENCES styles(id),
    material_line_id text REFERENCES material_lines(id), color_id text REFERENCES colors(id),
    lines jsonb NOT NULL, pair_count integer NOT NULL DEFAULT 0, single_count integer NOT NULL DEFAULT 0,
    sqft numeric, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS renders (
    id text PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id), bom_id text REFERENCES boms(id),
    variant_id text REFERENCES variants(id), color_id text REFERENCES colors(id), style_id text REFERENCES styles(id),
    model text, prompt_version text, prompt text, cloudinary_public_id text, secure_url text,
    status text NOT NULL DEFAULT 'queued', error text, qa_score numeric, qa_json jsonb,
    created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS quotes (
    id text PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id), render_id text REFERENCES renders(id),
    bom_id text REFERENCES boms(id), name text NOT NULL, email text NOT NULL, phone text, notes text,
    routed_to text, postmark_message_id text, status text NOT NULL DEFAULT 'new',
    created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS events (
    id bigserial PRIMARY KEY, session_id uuid REFERENCES sessions(id), type text NOT NULL,
    payload jsonb, created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS events_session_idx ON events (session_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS sessions_tenant_created_idx ON sessions (tenant_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS quotes_created_idx ON quotes (created_at DESC)`,
];

async function init() {
  for (const sql of DDL) await pool.query(sql);
  return DDL.length;
}

// Thin helpers so callers do not repeat pool.query boilerplate.
const q = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;
const many = async (text, params) => (await pool.query(text, params)).rows;

async function logEvent(sessionId, type, payload) {
  try { await q('INSERT INTO events (session_id, type, payload) VALUES ($1,$2,$3)', [sessionId || null, type, payload || null]); }
  catch (e) { console.error('[events]', type, e.message); }
}

// Seed tenants + site_config from config/tenants.seed.json. Idempotent: upserts by slug; never deletes.
async function seedTenants(seed) {
  for (const t of seed.tenants) {
    await q(`INSERT INTO tenants (id, slug, hostnames, name, quote_to_email) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (slug) DO UPDATE SET hostnames = EXCLUDED.hostnames, name = EXCLUDED.name,
             quote_to_email = COALESCE(EXCLUDED.quote_to_email, tenants.quote_to_email)`,
      [t.id, t.slug, t.hostnames, t.name, t.quote_to_email || null]);
    for (const [key, value] of Object.entries(t.site_config || {})) {
      await q(`INSERT INTO site_config (tenant_id, key, value) VALUES ($1,$2,$3)
               ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [t.id, key, JSON.stringify(value)]);
    }
  }
  return seed.tenants.length;
}

module.exports = { pool, init, q, one, many, logEvent, seedTenants, DDL };
