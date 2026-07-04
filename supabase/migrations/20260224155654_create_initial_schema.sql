/*
  # Create initial schema for EMW Vibe Play

  1. New Tables
    - `patterns`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text) - pattern display name
      - `description` (text) - optional description
      - `timbre_type` (smallint) - 0=Linear, 1=Sine, 2=Gaussian
      - `is_repeating` (boolean) - repeating vs non-repeating
      - `mic` (smallint) - Main Intensity Control value 0-100
      - `pattern_data` (jsonb) - waveform segment parameters
      - `datagram_hex` (text) - pre-built datagram as hex string
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `sessions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `device_name` (text) - BLE device name
      - `firmware_version` (text) - device firmware version
      - `protocol_version` (text) - protocol version
      - `connected_at` (timestamptz)
      - `disconnected_at` (timestamptz, nullable)

    - `session_logs`
      - `id` (uuid, primary key)
      - `session_id` (uuid, references sessions)
      - `direction` (text) - 'send' or 'receive'
      - `characteristic_uuid` (text) - BLE characteristic UUID
      - `hex_data` (text) - raw hex representation
      - `parsed_summary` (text, nullable) - human-readable interpretation
      - `logged_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Users can only access their own data
*/

CREATE TABLE IF NOT EXISTS patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  timbre_type smallint NOT NULL DEFAULT 0,
  is_repeating boolean NOT NULL DEFAULT true,
  mic smallint NOT NULL DEFAULT 50,
  pattern_data jsonb NOT NULL DEFAULT '{}',
  datagram_hex text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own patterns"
  ON patterns FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own patterns"
  ON patterns FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own patterns"
  ON patterns FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own patterns"
  ON patterns FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  device_name text NOT NULL DEFAULT '',
  firmware_version text NOT NULL DEFAULT '',
  protocol_version text NOT NULL DEFAULT '',
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sessions"
  ON sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS session_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) NOT NULL,
  direction text NOT NULL DEFAULT 'send',
  characteristic_uuid text NOT NULL DEFAULT '',
  hex_data text NOT NULL DEFAULT '',
  parsed_summary text,
  logged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own session logs"
  ON session_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_logs.session_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own session logs"
  ON session_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_logs.session_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own session logs"
  ON session_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_logs.session_id
      AND sessions.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_patterns_user_id ON patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_session_id ON session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_logged_at ON session_logs(logged_at);
