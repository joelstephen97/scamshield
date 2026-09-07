#!/usr/bin/env node
// scripts/dev/score-hosts.js — reads hostnames (or bare "N,host" Tranco CSV
// rows) from stdin, one per line, and prints any that score >= 0.5 on
// scoreUrl, with their reasons (0.13.0, Task 8 Step 5 FP gate).
'use strict';
const readline = require('readline');
const H = require('../../engine/heuristics.js');

const rl = readline.createInterface({ input: process.stdin, terminal: false });
let total = 0, hits = 0;
rl.on('line', (line) => {
  const raw = line.trim();
  if (!raw || raw.startsWith('#')) return;
  const host = raw.includes(',') ? raw.split(',')[1] : raw;
  if (!host) return;
  total++;
  const u = H.scoreUrl('https://' + host + '/');
  if (u.score >= 0.5) {
    hits++;
    console.log(host + '\t' + u.score.toFixed(2) + '\t' + JSON.stringify(u.reasons.map((r) => r.code)));
  }
});
rl.on('close', () => {
  console.error(`checked ${total} hosts, ${hits} scored >= 0.5`);
});
