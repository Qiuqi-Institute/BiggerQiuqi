/*
 * Copyright (C) 2026 Qiuqi Institute
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see &lt;https://www.gnu.org/licenses/&gt;.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 80;
const RUNTIME_DIR = path.join(__dirname, 'runtime', 'data');
const DB_PATH = path.join(RUNTIME_DIR, 'leaderboard.db');
const DIST_DIR = path.join(__dirname, 'dist');

fs.mkdirSync(RUNTIME_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS leaderboard (
    browser_id TEXT PRIMARY KEY,
    best_score INTEGER NOT NULL DEFAULT 0,
    last_score INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const upsertScoreStmt = db.prepare(`
  INSERT INTO leaderboard (browser_id, best_score, last_score, updated_at)
  VALUES (@browser_id, @score, @score, CURRENT_TIMESTAMP)
  ON CONFLICT(browser_id) DO UPDATE SET
    best_score = CASE
      WHEN excluded.best_score > leaderboard.best_score THEN excluded.best_score
      ELSE leaderboard.best_score
    END,
    last_score = excluded.last_score,
    updated_at = CURRENT_TIMESTAMP
`);

const getTopScoresStmt = db.prepare(`
  SELECT browser_id, best_score, last_score, updated_at
  FROM leaderboard
  ORDER BY best_score DESC, updated_at ASC
  LIMIT ?
`);

const getPlayerStmt = db.prepare(`
  SELECT browser_id, best_score, last_score, updated_at
  FROM leaderboard
  WHERE browser_id = ?
`);

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/leaderboard', (req, res) => {
  const limit = Math.min(Number.parseInt(req.query.limit, 10) || 10, 100);
  const rows = getTopScoresStmt.all(limit);
  res.json({ leaderboard: rows });
});

app.get('/api/leaderboard/:browserId', (req, res) => {
  const browserId = req.params.browserId;
  const row = getPlayerStmt.get(browserId);

  if (!row) {
    res.json({
      browser_id: browserId,
      best_score: 0,
      last_score: 0,
      updated_at: null,
    });
    return;
  }

  res.json(row);
});

app.post('/api/leaderboard', (req, res) => {
  const { browser_id: browserId, score } = req.body || {};

  if (!browserId || typeof browserId !== 'string') {
    res.status(400).json({ error: 'browser_id is required' });
    return;
  }

  if (!Number.isFinite(score) || score < 0) {
    res.status(400).json({ error: 'score must be a non-negative number' });
    return;
  }

  upsertScoreStmt.run({
    browser_id: browserId,
    score: Math.floor(score),
  });

  const row = getPlayerStmt.get(browserId);
  res.json({ ok: true, player: row });
});

app.use(express.static(DIST_DIR));

app.use((_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BiggerQiuqi server listening on port ${PORT}`);
});