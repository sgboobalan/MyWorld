
import React, { useEffect, useState } from 'react'

const GITHUB_USER = import.meta.env.VITE_GITHUB_USER || 'octocat'
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN || null

export default function App() {
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [detailsByRepo, setDetailsByRepo] = useState({})

  useEffect(() => {
    setLoading(true)
    setError(null)
    const headers = GITHUB_TOKEN
      ? { Authorization: `token ${GITHUB_TOKEN}` }
      : {}
    // Fetch repositories
    fetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(async (data) => {
        const sorted = Array.isArray(data)
          ? data.sort((a, b) => b.stargazers_count - a.stargazers_count)
          : []
        setRepos(sorted)

        // Fetch lightweight counts (per_page=1 + Link header) for commits and pulls
        try {
          const counts = await Promise.all(
            sorted.map(async (repo) => {
              const owner = repo.owner?.login || GITHUB_USER
              const name = repo.name

              const getCount = async (url) => {
                try {
                  const r = await fetch(url, { headers })
                  if (!r.ok) return 0
                  const link = r.headers.get('Link')
                  if (link) {
                    const m = link.match(/<[^>]+[&?]page=(\d+)[^>]*>; rel=\"last\"/)
                    if (m) return Number(m[1])
                  }
                  const arr = await r.json()
                  return Array.isArray(arr) ? arr.length : 0
                } catch (e) {
                  return 0
                }
              }

              const commitsUrl = `https://api.github.com/repos/${owner}/${name}/commits?per_page=1`
              const pullsUrl = `https://api.github.com/repos/${owner}/${name}/pulls?state=all&per_page=1`
              const [commitsCount, pullsCount] = await Promise.all([getCount(commitsUrl), getCount(pullsUrl)])
              return { key: repo.full_name, commitsCount, pullsCount }
            })
          )

          const map = counts.reduce((acc, it) => ({ ...acc, [it.key]: { ...(acc[it.key] || {}), commitsCount: it.commitsCount, pullsCount: it.pullsCount } }), {})
          setDetailsByRepo((s) => ({ ...s, ...map }))
        } catch (e) {
          // ignore per-repo count failures
        }
      })
      .catch((err) => setError(err.message || 'Failed to fetch'))
      .finally(() => setLoading(false))
  }, [])

  function toggleDetails(repo) {
    const key = repo.full_name
    setExpanded((s) => ({ ...s, [key]: !s[key] }))
    if (!detailsByRepo[key] && !detailsByRepo[key]?.loading) {
      fetchRepoDetails(repo)
    }
  }

  async function fetchRepoDetails(repo) {
    const key = repo.full_name
    setDetailsByRepo((s) => ({ ...s, [key]: { loading: true } }))
    const owner = repo.owner?.login || GITHUB_USER
    const name = repo.name
    const headers = GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {}

    try {
      const [commRes, prRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${name}/commits?per_page=5`, { headers }),
        fetch(`https://api.github.com/repos/${owner}/${name}/pulls?state=all&per_page=5`, { headers }),
      ])

      if (!commRes.ok) throw new Error(`Commits request failed: ${commRes.status}`)
      if (!prRes.ok) throw new Error(`Pulls request failed: ${prRes.status}`)

      const commits = await commRes.json()
      const pulls = await prRes.json()

      setDetailsByRepo((s) => ({ ...s, [key]: { loading: false, commits, pulls } }))
    } catch (err) {
      setDetailsByRepo((s) => ({ ...s, [key]: { loading: false, error: err.message || 'Failed' } }))
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 20 }}>
      <h1>GitHub repositories for {GITHUB_USER}</h1>

      {loading && <p>Loading repositories…</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {!loading && !error && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {repos.map((r) => {
            const key = r.full_name
            const det = detailsByRepo[key] || {}
            const isOpen = !!expanded[key]
            const commitsCountBadge = det.commitsCount ?? (det.commits ? det.commits.length : null)
            const pullsCountBadge = det.pullsCount ?? (det.pulls ? det.pulls.length : null)
            return (
              <li key={r.id} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span onClick={() => toggleDetails(r)} role="button" tabIndex={0} style={{ fontSize: 16, fontWeight: 600, cursor: 'pointer', color: '#0366d6' }}>
                    {r.name}
                  </span>
                  <a href={r.html_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#0366d6', textDecoration: 'none' }} aria-label="Open on GitHub">
                    ↗
                  </a>
                  <span style={{ marginLeft: 6, background: '#f3f4f6', padding: '2px 8px', borderRadius: 999, fontSize: 12, color: '#111' }}>
                    Commits: {commitsCountBadge ?? '—'}
                  </span>
                  <span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 999, fontSize: 12, color: '#111' }}>
                    PRs: {pullsCountBadge ?? '—'}
                  </span>
                </div>
                {r.description && <div style={{ marginTop: 6 }}>{r.description}</div>}
                <div style={{ marginTop: 6, fontSize: 13, color: '#444' }}>
                  ⭐ {r.stargazers_count} • {r.language || '—'}
                </div>

                {isOpen && (
                  <div style={{ marginTop: 10, padding: 12, border: '1px solid #eee', borderRadius: 6 }}>
                    {det.loading && <div>Loading details…</div>}
                    {det.error && <div style={{ color: 'red' }}>Error: {det.error}</div>}

                    {det.commits && (
                      <div style={{ marginBottom: 10 }}>
                        <strong>Recent commits</strong>
                        <ul style={{ marginTop: 8 }}>
                          {det.commits.map((c) => (
                            <li key={c.sha} style={{ marginBottom: 8 }}>
                              <a href={c.html_url} target="_blank" rel="noreferrer">
                                {c.commit?.message.split('\n')[0]}
                              </a>
                              <div style={{ fontSize: 12, color: '#666' }}>
                                {c.commit?.author?.name} • {new Date(c.commit?.author?.date).toLocaleString()}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {det.pulls && (
                      <div>
                        <strong>Recent pull requests</strong>
                        <ul style={{ marginTop: 8 }}>
                          {det.pulls.map((p) => (
                            <li key={p.id} style={{ marginBottom: 8 }}>
                              <a href={p.html_url} target="_blank" rel="noreferrer">
                                #{p.number} {p.title}
                              </a>
                              <div style={{ fontSize: 12, color: '#666' }}>
                                {p.user?.login} • {p.state}{p.merged_at ? ' • merged' : ''}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
