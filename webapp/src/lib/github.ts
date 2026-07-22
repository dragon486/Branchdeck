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
