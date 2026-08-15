// Server-Sent Events hub - powers live updates on the TV Display and Agent
// Terminal (new token issued, token called, token completed, etc.) without
// needing a WebSocket library. Clients are grouped by branchId so a token
// event in one branch never gets pushed to another branch's display.

const clientsByBranch = new Map(); // branchId -> Set(res)

export function sseHandler(req, res, branchId) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('retry: 2000\n\n');

  if (!clientsByBranch.has(branchId)) clientsByBranch.set(branchId, new Set());
  clientsByBranch.get(branchId).add(res);

  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const set = clientsByBranch.get(branchId);
    if (set) {
      set.delete(res);
      if (set.size === 0) clientsByBranch.delete(branchId);
    }
  });
}

export function broadcast(branchId, event, data) {
  const set = clientsByBranch.get(branchId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    res.write(payload);
  }
}
