// Throwaway collector for the iOS capability page's POSTed JSON -- there is no CDP on this path, so
// this is how the page's own computed record reaches disk without hand-transcription off a screenshot.
import http from 'node:http';
import { appendFileSync } from 'node:fs';
const OUT = process.env.OUT_FILE;
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      appendFileSync(OUT, body + '\n');
      res.writeHead(200); res.end('ok');
    });
  } else { res.writeHead(404); res.end(); }
}).listen(9333, () => console.log('collector on 9333'));
