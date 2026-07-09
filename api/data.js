const OWNER = 'kimjunhyuk25';
const REPO = 'gold-paju-place-tracker';
const FILE_PATH = 'data/tracker.json';
const BRANCH = 'main';

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_API_TOKEN}`,
    'User-Agent': 'gold-paju-place-tracker',
    Accept: 'application/vnd.github+json',
  };
}

async function readFile() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const r = await fetch(url, { headers: ghHeaders() });
  if (!r.ok) {
    return { data: { daily: {} }, sha: undefined };
  }
  const j = await r.json();
  const content = Buffer.from(j.content, 'base64').toString('utf-8');
  return { data: JSON.parse(content), sha: j.sha };
}

async function writeFile(data, sha, message) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  const body = {
    message,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!process.env.GITHUB_API_TOKEN) {
    res.status(500).json({ error: 'server not configured: missing GITHUB_API_TOKEN' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const { data } = await readFile();
      res.status(200).json(data);
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { password, date, entry } = body;

      if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      if (!date || typeof date !== 'string' || !entry || typeof entry !== 'object') {
        res.status(400).json({ error: 'bad request' });
        return;
      }

      const { data, sha } = await readFile();
      if (!data.daily) data.daily = {};
      data.daily[date] = {
        inflow: entry.inflow === undefined ? null : entry.inflow,
        call: entry.call === undefined ? null : entry.call,
        direction: entry.direction === undefined ? null : entry.direction,
        review: entry.review === undefined ? null : entry.review,
        adStatus: entry.adStatus === "off" ? "off" : "on",
      };

      const putRes = await writeFile(data, sha, `Update ${date}`);
      if (!putRes.ok) {
        const detail = await putRes.text();
        res.status(502).json({ error: 'failed to write to storage', detail });
        return;
      }

      res.status(200).json(data);
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
