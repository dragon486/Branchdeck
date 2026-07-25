export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  if (!repoUrl) return null;
  try {
    const url = new URL(repoUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  } catch (e) {
    // If it's something like "owner/repo" instead of a full URL
    const parts = repoUrl.split('/').filter(Boolean);
    if (parts.length === 2) {
      return { owner: parts[0], repo: parts[1] };
    }
  }
  return null;
}

export async function fetchGitHubCommits(owner: string, repo: string, path: string, token: string, perPage: number = 10) {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Branchdeck-App'
  };
  
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=${perPage}`;
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }
  
  return response.json();
}

export async function fetchGitHubContents(owner: string, repo: string, path: string, token: string) {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Branchdeck-App'
  };
  
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`GitHub API error: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Fetch the decoded text content of a single file from GitHub.
 * Returns null if the file is binary, too large, or not found.
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  filePath: string,
  token?: string
): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Branchdeck-App',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      { headers }
    );
    if (!res.ok) return null;

    const data = await res.json();
    // GitHub returns base64-encoded content for files
    if (data.encoding === 'base64' && data.content) {
      // Decode base64 — works in Node.js (Next.js server-side)
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Batch-fetch file contents for a set of files with concurrency control.
 * Fetches up to `maxFiles` files, no more than `concurrency` at a time.
 * Returns a map of filePath → source content.
 */
export async function batchFetchFileContents(
  owner: string,
  repo: string,
  filePaths: string[],
  token?: string,
  maxFiles = 30,
  concurrency = 5
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const targets = filePaths.slice(0, maxFiles);

  // Process in batches of `concurrency`
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map(async (fp) => {
        const content = await fetchFileContent(owner, repo, fp, token);
        return { fp, content };
      })
    );
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value.content) {
        results.set(result.value.fp, result.value.content);
      }
    }
  }

  return results;
}
