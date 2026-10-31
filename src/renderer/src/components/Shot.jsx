import { useCallback, useEffect, useMemo, useState } from 'react'
import { media } from '../media'
import Hero from './Hero'
import Findings from './Findings'
import { LiveFrame } from './Live'
import { CompareViewer, PromptDiff, runChanges } from './Compare'
import { lintPrompt } from '../../../service/lint'

const DONE = ['success', 'error', 'cancelled']
const FINAL_MP = [1, 1.5, 2]

export function Progress({ job }) {
  if (!job || DONE.includes(job.status)) return null
  const p = job.progress
  const pct = p ? Math.round((p.value / p.max) * 100) : null
  return (
    <div className="progress">
      <div className="bar">
        <span style={{ width: `${pct ?? 6}%` }} className={pct == null ? 'indeterminate' : ''} />
      </div>
      <span className="mono dim">
        {job.status === 'queued' ? `Queued${job.queuePosition ? ` · #${job.queuePosition}` : ''}` : p ? `Step ${p.value}/${p.max}` : 'Working…'}
      </span>
      <button className="link-btn mono" onClick={() => window.ivstudio.jobs.cancel(job.id)}>
        Cancel
      </button>
      {job.status !== 'queued' && <LiveFrame promptId={job.promptId} takes={job.plan?.resolved?.previews || 1} />}
    </div>
  )
}

function FinishPanel({ job, candidate, onStart, notify, caps, remote }) {
  const FPS = caps?.fps || [0, 30, 50, 60, 120]
  const dlss = caps?.dlss !== false
  const [opts, setOpts] = useState({ megapixels: 2, upscale2x: false, fps: 0, audio: 'pass', enhancer: 'dlss', enhanceResolution: 1080 })
  const seedvr2 = opts.enhancer === 'seedvr2'
  const [size, setSize] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (patch) => setOpts((o) => ({ ...o, ...patch }))
  const single = job.plan.request?.mode === 'continue'
  const hasVoice = !!job.plan.request?.voiceLine

  useEffect(() => {
    window.ivstudio.render
      .planFinish(job.id, { candidate, ...opts })
      .then(setSize)
      .catch(() => setSize(null))
  }, [opts, job.id, candidate])

  async function go() {
    setBusy(true)
    try {
      onStart(await window.ivstudio.render.finish({ jobId: job.id, candidate, ...opts }))
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="finish-panel">
      <p className="mono label">Finish candidate {candidate}</p>
      {!single && (
        <div className="row">
          <span className="row-label">Final size</span>
          <div className="segmented">
            {FINAL_MP.map((mp) => (
              <button key={mp} className={opts.megapixels === mp ? 'on' : ''} onClick={() => set({ megapixels: mp })}>
                {mp} MP
              </button>
            ))}
          </div>
        </div>
      )}
      {dlss && !remote && (
        <div className="row">
          <span className="row-label">Enhancer</span>
          <div className="enhancer-pick">
            <div className="segmented">
              <button className={!seedvr2 ? 'on' : ''} onClick={() => set({ enhancer: 'dlss' })}>
                DLSS 5
              </button>
              <button className={seedvr2 ? 'on' : ''} onClick={() => set({ enhancer: 'seedvr2', upscale2x: false, fps: 0 })}>
                SeedVR2
              </button>
            </div>
            <span className="dim small">{seedvr2 ? 'Restores detail after the finish. Slower; 24 fps.' : 'Cleans up and can upscale 2× and add frames. Quick.'}</span>
          </div>
        </div>
      )}
      {seedvr2 ? (
        <div className="row">
          <span className="row-label">SeedVR2 size</span>
          <div className="segmented">
            {[1080, 1440, 2160].map((r) => (
              <button key={r} className={opts.enhanceResolution === r ? 'on' : ''} onClick={() => set({ enhanceResolution: r })}>
                {r}p
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="row">
            <span className="row-label">{dlss ? 'RTX upscale' : '2× upscale'}</span>
            <div className="segmented">
              <button className={!opts.upscale2x ? 'on' : ''} onClick={() => set({ upscale2x: false })}>
                Off
              </button>
              <button className={opts.upscale2x ? 'on' : ''} onClick={() => set({ upscale2x: true })}>
                2×
              </button>
            </div>
          </div>
          <div className="row">
            <span className="row-label">Frame rate</span>
            <div className="segmented">
              {FPS.map((f) => (
                <button key={f} className={opts.fps === f ? 'on' : ''} onClick={() => set({ fps: f })}>
                  {f ? f : '24'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {!single && (
        <div className="row">
          <span className="row-label">Sound</span>
          <div className="segmented">
            <button className={opts.audio === 'pass' ? 'on' : ''} onClick={() => set({ audio: 'pass' })}>
              Generated
            </button>
            <button className={opts.audio === 'preview' ? 'on' : ''} onClick={() => set({ audio: 'preview' })} title="Keeps a voice cloned from an <Audio> reference or RefMod">
              Preview's
            </button>
            {hasVoice && (
              <button className={opts.audio === 'voice' ? 'on' : ''} onClick={() => set({ audio: 'voice' })}>
                My recording
              </button>
            )}
          </div>
        </div>
      )}
      <div className="finish-go">
        <span className="mono">{size ? `${size.width} × ${size.height} · ${size.fps} fps${single ? ' · single pass' : ''}` : '…'}</span>
        <button className="btn btn-primary" disabled={busy} onClick={go}>
          {busy ? 'Starting…' : 'Finish'}
        </button>
      </div>
    </div>
  )
}

export default function Shot({ projectId, jobs: live, setJobs, notify, go, caps, remote, editRun, characters = [] }) {
  const [project, setProject] = useState(null)
  const [jobIds, setJobIds] = useState([])
  const [picked, setPicked] = useState({})
  const [name, setName] = useState('')
  // takes marked for Compare (up to two): { key, url, label, prompt }; the viewer opens when there are two
  const [marked, setMarked] = useState([])
  const [comparing, setComparing] = useState(false)
  const mark = (take) => {
    const next = marked.some((m) => m.key === take.key) ? marked.filter((m) => m.key !== take.key) : [...marked, take].slice(-2)
    setMarked(next)
    if (next.length === 2) setComparing(true)
  }
  const isMarked = (key) => marked.some((m) => m.key === key)
  // take ranking (ranking.js): runs as they finish are ranked by the app; older ones on request
  const [ranking, setRanking] = useState({})
  async function rank(run) {
    setRanking((r) => ({ ...r, [run.id]: true }))
    try {
      const job = await window.ivstudio.rank.job(run.id)
      setJobs((all) => ({ ...all, [job.id]: job }))
    } catch (err) {
      notify(err.message)
    } finally {
      setRanking((r) => ({ ...r, [run.id]: false }))
    }
  }
  // Enhance (SeedVR2) on a finished video: a new job under it
  const [enhancing, setEnhancing] = useState({})
  async function enhance(f, opts) {
    setEnhancing((e) => ({ ...e, [f.id]: true }))
    try {
      onStart(await window.ivstudio.render.enhance({ jobId: f.id, ...opts }))
      notify(`Enhancing with ${opts.engine === 'dlss' ? `DLSS 5 at ${opts.scale}×` : `SeedVR2 at ${opts.resolution}p`}. It shows here when it's done.`, 'info')
    } catch (err) {
      notify(err.message)
    } finally {
      setEnhancing((e) => ({ ...e, [f.id]: false }))
    }
  }
  const pick = (run, candidate) => {
    setPicked({ ...picked, [run.id]: candidate })
    if (run.ranking) window.ivstudio.rank.learn(run.id, candidate).catch(() => {})
  }

  const load = useCallback(async () => {
    const { project, jobs } = await window.ivstudio.projects.get(projectId)
    setProject(project)
    setName(project.name)
    setJobIds(jobs.map((j) => j.id))
    setJobs((all) => ({ ...all, ...Object.fromEntries(jobs.map((j) => [j.id, all[j.id] && !DONE.includes(j.status) ? all[j.id] : j])) }))
    const open = jobs.filter((j) => !DONE.includes(j.status)).map((j) => j.id)
    if (open.length) window.ivstudio.jobs.watch(open)
  }, [projectId, setJobs])

  useEffect(() => {
    load()
  }, [load])

  const jobs = useMemo(() => jobIds.map((id) => live[id]).filter(Boolean), [jobIds, live])
  // a finish with SeedVR2 as its enhancer starts its enhance step when it's done: that job joins the page
  useEffect(() => {
    const chained = jobs.map((j) => j.enhanceJob).filter((id) => id && !jobIds.includes(id))
    if (chained.length) load()
  }, [jobs, jobIds, load])
  const runs = jobs.filter((j) => j.kind === 'previews').reverse()
  const finishesOf = (id) => jobs.filter((j) => j.parent === id).reverse()

  const onStart = (job) => {
    setJobIds((ids) => [...ids, job.id])
    setJobs((all) => ({ ...all, [job.id]: job }))
  }

  if (!project) return null

  return (
    <div className="shot">
      <Hero art="shots" back={{ label: 'All shots', onClick: () => go('library') }} kicker={`Shot · ${runs.length} run${runs.length === 1 ? '' : 's'}`}>
        <input className="shot-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== project.name && window.ivstudio.projects.rename(projectId, name)} />
      </Hero>
      <div className="shot-actions">
        {runs[0] && editRun ? (
          <button className="btn btn-small" onClick={() => editRun(runs[0], project)}>
            Edit the latest and run again
          </button>
        ) : (
          <button className="btn btn-small" onClick={() => go('create')}>
            New run
          </button>
        )}
        {marked.length === 1 && <span className="mono dim small">1 take marked: mark another to compare them</span>}
      </div>
      {comparing && marked.length === 2 && (
        <CompareViewer
          a={marked[0]}
          b={marked[1]}
          onClose={() => {
            setComparing(false)
            setMarked([])
          }}
        />
      )}

      {runs.length === 0 && <p className="dim">No runs yet.</p>}
      {runs.map((run, i) => {
        const previews = run.outputs.filter((o) => o.kind === 'preview')
        const req = run.plan.request || {}
        const written = run.plan.asked?.prompt ?? req.prompt
        const before = runs[i + 1]
        const changes = runChanges(req, before?.plan.request)
        const ch = characters.find((c) => c.id === req.character)
        const findings = req.prompt ? lintPrompt(req.prompt, { mode: req.mode, seconds: req.seconds, media: req.media || [], character: ch ? { name: ch.name, trigger: ch.trigger } : null, voiceLine: req.voiceLine }) : []
        const notes = findings.filter((f) => f.level !== 'info').length
        const takeOf = (key, url, label) => ({ key: `${run.id}:${key}`, url: media(url), label: `Run ${runs.length - i} · ${label}`, prompt: written })
        return (
          <section key={run.id} className="run">
            <div className="run-head">
              <h2>Run {runs.length - i}</h2>
              <span className="mono dim">
                {req.mode} · {run.plan.resolved?.width}×{run.plan.resolved?.height} · {run.plan.resolved?.seconds} s · seed {req.seed}
                {run.seconds ? ` · ${run.seconds} s render` : ''}
              </span>
              {changes.length > 0 && <span className="run-changes mono small">changed: {changes.join(' · ')}</span>}
              {editRun && (
                <button className="link-btn mono small run-edit" onClick={() => editRun(run, project)}>
                  Edit and run again
                </button>
              )}
            </div>
            <Progress job={run} />
            {run.status === 'error' && <p className="notice">{run.error}</p>}
            {req.prompt && (
              <details className="run-prompt">
                <summary className="mono dim">
                  Prompt{notes ? ` · ${notes} checker note${notes > 1 ? 's' : ''}` : ''}
                </summary>
                <pre>{written}</pre>
                {written !== req.prompt && (
                  <details className="run-resolved">
                    <summary className="mono dim small">As rendered (with the @ mentions resolved)</summary>
                    <pre>{req.prompt}</pre>
                  </details>
                )}
                {before?.plan.request?.prompt && before.plan.request.prompt !== req.prompt && (
                  <details className="run-resolved">
                    <summary className="mono dim small">What changed since run {runs.length - i - 1}</summary>
                    <PromptDiff before={before.plan.asked?.prompt ?? before.plan.request.prompt} after={written} />
                  </details>
                )}
                <Findings findings={findings} compact />
                <button className="link-btn small" onClick={() => navigator.clipboard.writeText(written).then(() => notify('Prompt copied.', 'info'), () => notify('Could not copy the prompt.'))}>
                  Copy the prompt
                </button>
              </details>
            )}
            {previews.length > 1 && !run.ranking && (
              <button className="link-btn mono small rank-btn" disabled={!!ranking[run.id]} onClick={() => rank(run)}>
                {ranking[run.id] ? 'Ranking the takes… (a minute when there are lines to hear)' : '★ Rank these takes'}
              </button>
            )}
            {previews.length > 0 && (
              <div className={`candidates n${previews.length}`}>
                {previews.map((o) => {
                  const r = run.ranking?.takes?.find((t) => t.candidate === o.candidate)
                  return (
                  <figure key={o.candidate} className={`candidate ${picked[run.id] === o.candidate ? 'on' : ''} ${r?.best ? 'best' : ''}`}>
                    {r && (
                      <div className="take-rank" title={Object.entries(r.parts).filter(([, v]) => v != null).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ')}>
                        <span className="mono small">{r.best ? '★ Best take' : `Score ${Math.round((r.score ?? 0) * 100)}`}</span>
                        {r.reasons?.length > 0 && <span className="small dim">{r.reasons.join(' · ')}</span>}
                      </div>
                    )}
                    <video src={media(o.url)} controls loop preload="metadata" />
                    <figcaption>
                      <span className="mono">#{o.candidate} · seed {o.seed}</span>
                      <button className={`link-btn mono small ${isMarked(`${run.id}:${o.candidate}`) ? 'pink' : ''}`} onClick={() => mark(takeOf(o.candidate, o.url, `#${o.candidate} · seed ${o.seed}`))}>
                        {isMarked(`${run.id}:${o.candidate}`) ? 'Marked' : 'Compare'}
                      </button>
                      <button className="btn btn-small" onClick={() => pick(run, o.candidate)}>
                        {picked[run.id] === o.candidate ? 'Picked' : 'Pick'}
                      </button>
                    </figcaption>
                  </figure>
                  )
                })}
              </div>
            )}
            {picked[run.id] && <FinishPanel job={run} candidate={picked[run.id]} onStart={onStart} notify={notify} caps={caps} remote={remote} />}
            {finishesOf(run.id).map((f) => {
              const final = f.outputs.find((o) => o.kind === 'final')
              return (
                <div key={f.id} className="final">
                  <div className="final-head">
                    <span className="mono pink">Final · candidate {f.plan.finish?.candidate}</span>
                    <span className="mono dim">
                      {f.plan.resolved?.finishWidth ? `${f.plan.resolved.finishWidth}×${f.plan.resolved.finishHeight}, SeedVR2 to ` : ''}{f.plan.resolved?.width}×{f.plan.resolved?.height} · {f.plan.resolved?.fps} fps{f.seconds ? ` · ${f.seconds} s render` : ''}
                    </span>
                    {final?.path && (
                      <button className="link-btn mono" onClick={() => window.ivstudio.files.reveal(final).catch((err) => notify(err.message))}>
                        {remote ? 'Download' : 'Show in folder'}
                      </button>
                    )}
                    {final?.url && (
                      <button className={`link-btn mono ${isMarked(`${run.id}:${f.id}`) ? 'pink' : ''}`} onClick={() => mark(takeOf(f.id, final.url, `final of #${f.plan.finish?.candidate}`))}>
                        {isMarked(`${run.id}:${f.id}`) ? 'Marked' : 'Compare'}
                      </button>
                    )}
                  </div>
                  <Progress job={f} />
                  {f.status === 'error' && <p className="notice">{f.error}</p>}
                  {final && <video className="final-video" src={media(final.url)} controls preload="metadata" />}
                  {final?.path && !remote && (
                    <div className="enhance-row">
                      <span className="mono dim small">Enhance:</span>
                      {caps?.dlss !== false &&
                        [1, 2].map((scale) => (
                          <button key={`d${scale}`} className="btn btn-small" disabled={!!enhancing[f.id]} onClick={() => enhance(f, { engine: 'dlss', scale })}>
                            DLSS 5 · {scale}×
                          </button>
                        ))}
                      {[1080, 1440].map((r) => (
                        <button key={`s${r}`} className="btn btn-small" disabled={!!enhancing[f.id]} onClick={() => enhance(f, { engine: 'seedvr2', resolution: r })}>
                          SeedVR2 · {r}p
                        </button>
                      ))}
                    </div>
                  )}
                  {jobs
                    .filter((e) => e.kind === 'enhance' && e.parent === f.id)
                    .map((e) => {
                      const out = e.outputs?.find((o) => o.kind === 'final')
                      return (
                        <div key={e.id} className="final enhanced">
                          <div className="final-head">
                            <span className="mono pink">Enhanced · {e.plan?.enhance?.engine === 'dlss' ? `DLSS 5 ${e.plan.enhance.scale}×` : `SeedVR2 ${e.plan?.enhance?.resolution}p`}</span>
                            <span className="mono dim">{e.seconds ? `${e.seconds} s render` : ''}</span>
                            {out?.path && (
                              <button className="link-btn mono" onClick={() => window.ivstudio.files.reveal(out).catch((err) => notify(err.message))}>
                                Show in folder
                              </button>
                            )}
                            {out?.url && final?.url && (
                              <button className="link-btn mono" onClick={() => (setMarked([takeOf(f.id, final.url, `final of #${f.plan.finish?.candidate}`), takeOf(e.id, out.url, e.plan?.enhance?.engine === 'dlss' ? `DLSS 5 ${e.plan.enhance.scale}×` : `SeedVR2 ${e.plan?.enhance?.resolution}p`)]), setComparing(true))}>
                                Compare with the final
                              </button>
                            )}
                          </div>
                          <Progress job={e} />
                          {e.status === 'error' && <p className="notice">{e.error}</p>}
                          {out && <video className="final-video" src={media(out.url)} controls preload="metadata" />}
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
