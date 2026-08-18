import { FormEvent, useEffect, useState } from 'react'
import { Activity, Dumbbell, ExternalLink, History, Home, LogOut, Play, RefreshCw, Save, UserRound, X } from 'lucide-react'
import { api, clearTokens, getAccessToken, saveTokens } from './api'

type User = {
  id: number
  full_name: string
  email: string
  onboarding_complete: boolean
  available_training_days: number | null
}

type Exercise = {
  id: number
  name_en: string
  name_ar?: string | null
  primary_muscle: string
  secondary_muscles?: string | null
  movement_pattern?: string
  equipment?: string
  youtube_url?: string | null
}

type ProgramExercise = {
  id: number
  target_sets: number
  target_rep_min: number
  target_rep_max: number
  target_rir: number | null
  exercise: Exercise
}

type ProgramDay = {
  id: number
  day_order: number
  name: string
  exercises: ProgramExercise[]
}

type Program = {
  id: number
  name: string
  training_days_per_week: number
  days: ProgramDay[]
}

type WorkoutExercise = {
  exercise_session_id: number
  exercise_id: number
  name: string
  name_ar?: string | null
  primary_muscle?: string
  movement_pattern?: string
  youtube_url?: string | null
  target_sets: number
  target_rep_min: number
  target_rep_max: number
  target_rir: number | null
  notes?: string | null
}

type StartedWorkout = {
  workout_session_id: number
  day_name: string
  exercises: WorkoutExercise[]
}

type HistoryItem = {
  id: number
  workout_date: string
  duration_minutes: number | null
  total_volume_kg: number
  completed_at: string | null
}

type Alternative = {
  exercise: Exercise
  priority: number
  reason?: string | null
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [program, setProgram] = useState<Program | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [activeTab, setActiveTab] = useState<'home' | 'workout' | 'progress' | 'profile'>('home')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [activeWorkout, setActiveWorkout] = useState<StartedWorkout | null>(null)

  const loadDashboard = async () => {
    const me = await api<User>('/auth/me')
    setUser(me)
    try {
      const p = await api<Program>('/program')
      setProgram(p)
    } catch {
      setProgram(null)
    }
    try {
      const h = await api<HistoryItem[]>('/workouts?limit=10')
      setHistory(h)
    } catch {
      setHistory([])
    }
  }

  useEffect(() => {
    ;(async () => {
      if (!getAccessToken()) {
        setLoading(false)
        return
      }
      try {
        await loadDashboard()
      } catch {
        clearTokens()
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <div className="screen center"><div className="loader" /></div>
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} onAuthenticated={async () => { await loadDashboard() }} />

  if (!program || !user.onboarding_complete) {
    return <Onboarding user={user} onComplete={async () => { await loadDashboard() }} />
  }

  const today = program.days[0]
  const completedCount = history.filter((h) => h.completed_at).length
  const weeklyVolume = history.reduce((sum, item) => sum + Number(item.total_volume_kg || 0), 0)

  const startWorkout = async (day: ProgramDay) => {
    setError('')
    try {
      const started = await api<StartedWorkout>('/workouts/start', {
        method: 'POST',
        body: JSON.stringify({ program_day_id: day.id }),
      })
      setActiveWorkout(started)
      setActiveTab('workout')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start workout')
    }
  }

  const logout = () => {
    clearTokens()
    setUser(null)
    setProgram(null)
  }

  return (
    <div className="app-shell">
      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        {activeTab === 'home' && (
          <section>
            <div className="topbar">
              <div>
                <span className="eyebrow">WORKOUT APP</span>
                <h1>Hi, {user.full_name.split(' ')[0]}</h1>
              </div>
              <div className="avatar">{user.full_name.charAt(0).toUpperCase()}</div>
            </div>

            <div className="hero-card">
              <div className="hero-copy">
                <span className="pill">TODAY</span>
                <h2>{today?.name || 'Workout'}</h2>
                <p>{today?.exercises.length || 0} exercises · {today?.exercises.reduce((s, e) => s + e.target_sets, 0) || 0} sets</p>
              </div>
              <button className="primary-button" onClick={() => today && startWorkout(today)}>
                <Play size={18} fill="currentColor" /> Start Workout
              </button>
            </div>

            <div className="stats-grid">
              <StatCard label="Workouts" value={`${completedCount}`} suffix="recent" />
              <StatCard label="Volume" value={`${Math.round(weeklyVolume).toLocaleString()}`} suffix="kg" />
              <StatCard label="Program" value={`${program.training_days_per_week}`} suffix="days/week" />
              <StatCard label="Status" value="Ready" suffix="adaptive" />
            </div>

            <div className="section-header"><h3>Your program</h3><span>{program.name}</span></div>
            <div className="day-list">
              {program.days.map((day) => (
                <button className="day-row" key={day.id} onClick={() => startWorkout(day)}>
                  <div>
                    <strong>{day.day_order}. {day.name}</strong>
                    <span>{day.exercises.map((e) => e.exercise.primary_muscle).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</span>
                  </div>
                  <span>{day.exercises.length} exercises</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'workout' && (
          activeWorkout ? (
            <WorkoutScreen workout={activeWorkout} onComplete={async () => { setActiveWorkout(null); await loadDashboard(); setActiveTab('home') }} />
          ) : (
            <section>
              <div className="section-header"><h2>Choose workout</h2></div>
              <div className="day-list">
                {program.days.map((day) => (
                  <button className="day-row" key={day.id} onClick={() => startWorkout(day)}>
                    <div><strong>{day.name}</strong><span>{day.exercises.length} exercises</span></div>
                    <Play size={18} />
                  </button>
                ))}
              </div>
            </section>
          )
        )}

        {activeTab === 'progress' && (
          <section>
            <div className="section-header"><h2>Progress</h2><span>Recent sessions</span></div>
            <div className="history-list">
              {history.length === 0 && <div className="empty-card">Complete your first workout to see progress.</div>}
              {history.map((item) => (
                <div className="history-row" key={item.id}>
                  <div><strong>{item.workout_date}</strong><span>{item.duration_minutes || 0} min</span></div>
                  <div className="history-volume">{Math.round(item.total_volume_kg || 0).toLocaleString()} kg</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'profile' && (
          <section>
            <div className="profile-card">
              <div className="large-avatar">{user.full_name.charAt(0).toUpperCase()}</div>
              <h2>{user.full_name}</h2>
              <p>{user.email}</p>
              <div className="profile-meta"><span>{program.training_days_per_week} training days</span><span>Adaptive program active</span></div>
              <button className="secondary-button danger" onClick={logout}><LogOut size={18} /> Logout</button>
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav">
        <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={<Home size={21} />} label="Home" />
        <NavButton active={activeTab === 'workout'} onClick={() => setActiveTab('workout')} icon={<Dumbbell size={21} />} label="Workout" />
        <NavButton active={activeTab === 'progress'} onClick={() => setActiveTab('progress')} icon={<History size={21} />} label="Progress" />
        <NavButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<UserRound size={21} />} label="Profile" />
      </nav>
    </div>
  )
}

function AuthScreen({ mode, setMode, onAuthenticated }: { mode: 'login' | 'register'; setMode: (m: 'login' | 'register') => void; onAuthenticated: () => Promise<void> }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register'
      const body = mode === 'login' ? { email, password } : { full_name: fullName, email, password }
      const tokens = await api<{ access_token: string; refresh_token: string }>(path, { method: 'POST', auth: false, body: JSON.stringify(body) })
      saveTokens(tokens.access_token, tokens.refresh_token)
      await onAuthenticated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="brand-mark"><Dumbbell size={28} /></div>
      <span className="eyebrow">ADAPTIVE TRAINING SYSTEM</span>
      <h1>Workout APP</h1>
      <p className="muted">Train. Track. Adapt. Progress.</p>
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
        {mode === 'register' && <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button full" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}</button>
        <button type="button" className="text-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Create account' : 'Already have an account? Login'}
        </button>
      </form>
    </div>
  )
}

function Onboarding({ user, onComplete }: { user: User; onComplete: () => Promise<void> }) {
  const [days, setDays] = useState<3 | 5>(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      await api('/program/generate', { method: 'POST', body: JSON.stringify({ training_days: days }) })
      await onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to generate program')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboarding-screen">
      <span className="eyebrow">WELCOME, {user.full_name.split(' ')[0].toUpperCase()}</span>
      <h1>How many days do you want to train?</h1>
      <p className="muted">We will generate your starting program. You can change it later.</p>
      <div className="choice-grid">
        <button className={days === 3 ? 'choice-card active' : 'choice-card'} onClick={() => setDays(3)}><strong>3 Days</strong><span>Push · Pull · Legs</span></button>
        <button className={days === 5 ? 'choice-card active' : 'choice-card'} onClick={() => setDays(5)}><strong>5 Days</strong><span>Push · Pull · Legs · Upper · Lower</span></button>
      </div>
      {error && <div className="form-error">{error}</div>}
      <button className="primary-button full" onClick={generate} disabled={busy}>{busy ? 'Building your program...' : 'Generate My Program'}</button>
    </div>
  )
}

function WorkoutScreen({ workout, onComplete }: { workout: StartedWorkout; onComplete: () => Promise<void> }) {
  const [exercises, setExercises] = useState<WorkoutExercise[]>(workout.exercises)
  const [setData, setSetData] = useState<Record<number, Array<{ weight: string; reps: string; rir: string; saved?: boolean }>>>({})
  const [notes, setNotes] = useState<Record<number, string>>(() => Object.fromEntries(workout.exercises.map((e) => [e.exercise_session_id, e.notes || ''])))
  const [noteSaved, setNoteSaved] = useState<Record<number, boolean>>({})
  const [swapFor, setSwapFor] = useState<WorkoutExercise | null>(null)
  const [alternatives, setAlternatives] = useState<Alternative[]>([])
  const [swapBusy, setSwapBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const rowsFor = (ex: WorkoutExercise) => {
    const current = setData[ex.exercise_session_id]
    if (current) return current
    return Array.from({ length: ex.target_sets }, () => ({ weight: '', reps: '', rir: String(ex.target_rir ?? 2) }))
  }

  const updateRow = (id: number, index: number, field: 'weight' | 'reps' | 'rir', value: string) => {
    setSetData((prev) => {
      const exercise = exercises.find((x) => x.exercise_session_id === id)!
      const rows = [...(prev[id] || rowsFor(exercise))]
      rows[index] = { ...rows[index], [field]: value }
      return { ...prev, [id]: rows }
    })
  }

  const saveSet = async (exerciseSessionId: number, index: number) => {
    setError('')
    try {
      const exercise = exercises.find((x) => x.exercise_session_id === exerciseSessionId)!
      const rows = setData[exerciseSessionId] || rowsFor(exercise)
      const row = rows[index]
      if (!row.weight || !row.reps) return
      await api(`/workouts/${workout.workout_session_id}/sets`, {
        method: 'POST',
        body: JSON.stringify({ exercise_session_id: exerciseSessionId, weight_kg: Number(row.weight), reps: Number(row.reps), rir: row.rir ? Number(row.rir) : null, completed: true }),
      })
      setSetData((prev) => {
        const copy = [...(prev[exerciseSessionId] || rows)]
        copy[index] = { ...copy[index], saved: true }
        return { ...prev, [exerciseSessionId]: copy }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save set')
    }
  }

  const saveNote = async (exerciseSessionId: number) => {
    setError('')
    try {
      await api(`/workouts/${workout.workout_session_id}/exercises/${exerciseSessionId}/notes`, {
        method: 'PUT',
        body: JSON.stringify({ notes: notes[exerciseSessionId] || null }),
      })
      setNoteSaved((prev) => ({ ...prev, [exerciseSessionId]: true }))
      window.setTimeout(() => setNoteSaved((prev) => ({ ...prev, [exerciseSessionId]: false })), 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save note')
    }
  }

  const openSwap = async (ex: WorkoutExercise) => {
    setError('')
    setSwapFor(ex)
    setAlternatives([])
    setSwapBusy(true)
    try {
      const data = await api<Alternative[]>(`/exercises/${ex.exercise_id}/alternatives`)
      setAlternatives(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load alternatives')
      setSwapFor(null)
    } finally {
      setSwapBusy(false)
    }
  }

  const chooseAlternative = async (alternative: Alternative) => {
    if (!swapFor) return
    setSwapBusy(true)
    setError('')
    try {
      const updated = await api<Partial<WorkoutExercise>>(`/workouts/${workout.workout_session_id}/exercises/${swapFor.exercise_session_id}/swap`, {
        method: 'POST',
        body: JSON.stringify({ alternative_exercise_id: alternative.exercise.id }),
      })
      setExercises((prev) => prev.map((item) => item.exercise_session_id === swapFor.exercise_session_id ? {
        ...item,
        exercise_id: updated.exercise_id ?? alternative.exercise.id,
        name: updated.name ?? alternative.exercise.name_en,
        name_ar: updated.name_ar ?? alternative.exercise.name_ar,
        primary_muscle: updated.primary_muscle ?? alternative.exercise.primary_muscle,
        movement_pattern: updated.movement_pattern ?? alternative.exercise.movement_pattern,
        youtube_url: updated.youtube_url ?? alternative.exercise.youtube_url,
        target_rep_min: updated.target_rep_min ?? item.target_rep_min,
        target_rep_max: updated.target_rep_max ?? item.target_rep_max,
      } : item))
      setSwapFor(null)
      setAlternatives([])
      setMessage('Exercise replaced. The change will also be used in future sessions.')
      window.setTimeout(() => setMessage(''), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to replace exercise')
    } finally {
      setSwapBusy(false)
    }
  }

  const finish = async () => {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await Promise.all(exercises.map((ex) => api(`/workouts/${workout.workout_session_id}/exercises/${ex.exercise_session_id}/notes`, {
        method: 'PUT',
        body: JSON.stringify({ notes: notes[ex.exercise_session_id] || null }),
      })))
      await api(`/workouts/${workout.workout_session_id}/complete`, { method: 'POST', body: JSON.stringify({ notes: null }) })
      try { await api(`/workouts/${workout.workout_session_id}/progression`) } catch {}
      setMessage('Workout completed')
      await onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete workout')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="workout-header"><div><span className="eyebrow">IN PROGRESS</span><h2>{workout.day_name}</h2></div><Activity size={26} /></div>
      {error && <div className="error-banner workout-alert">{error}</div>}
      {message && <div className="success-banner workout-alert">{message}</div>}

      {exercises.map((ex) => {
        const rows = setData[ex.exercise_session_id] || rowsFor(ex)
        const hasSavedSet = rows.some((row) => row.saved)
        return (
          <div className="exercise-card" key={ex.exercise_session_id}>
            <div className="exercise-title">
              <div>
                <strong>{ex.name}</strong>
                {ex.name_ar && <span className="exercise-ar">{ex.name_ar}</span>}
                <span>{ex.target_sets} × {ex.target_rep_min}-{ex.target_rep_max} · RIR {ex.target_rir ?? 2}</span>
              </div>
            </div>

            <div className="exercise-actions">
              {ex.youtube_url && (
                <a className="exercise-action youtube-action" href={ex.youtube_url} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} /> YouTube
                </a>
              )}
              <button className="exercise-action" onClick={() => openSwap(ex)} disabled={hasSavedSet} title={hasSavedSet ? 'Exercise cannot be replaced after saving sets' : 'Replace exercise'}>
                <RefreshCw size={16} /> Replace
              </button>
            </div>

            <div className="set-table-head"><span>SET</span><span>KG</span><span>REPS</span><span>RIR</span><span></span></div>
            {rows.map((row, i) => (
              <div className="set-row" key={i}>
                <span>{i + 1}</span>
                <input inputMode="decimal" value={row.weight} onChange={(e) => updateRow(ex.exercise_session_id, i, 'weight', e.target.value)} placeholder="0" />
                <input inputMode="numeric" value={row.reps} onChange={(e) => updateRow(ex.exercise_session_id, i, 'reps', e.target.value)} placeholder="0" />
                <input inputMode="decimal" value={row.rir} onChange={(e) => updateRow(ex.exercise_session_id, i, 'rir', e.target.value)} />
                <button className={row.saved ? 'set-done saved' : 'set-done'} onClick={() => saveSet(ex.exercise_session_id, i)} disabled={row.saved}>{row.saved ? '✓' : '+'}</button>
              </div>
            ))}

            <div className="exercise-notes">
              <label>Exercise notes</label>
              <textarea
                value={notes[ex.exercise_session_id] || ''}
                onChange={(e) => {
                  setNotes((prev) => ({ ...prev, [ex.exercise_session_id]: e.target.value }))
                  setNoteSaved((prev) => ({ ...prev, [ex.exercise_session_id]: false }))
                }}
                placeholder="Example: Last set felt heavy, shoulder discomfort, good control..."
                maxLength={2000}
              />
              <button className="note-save" onClick={() => saveNote(ex.exercise_session_id)}>
                <Save size={15} /> {noteSaved[ex.exercise_session_id] ? 'Saved' : 'Save note'}
              </button>
            </div>
          </div>
        )
      })}

      <button className="primary-button full finish-button" onClick={finish} disabled={busy}>{busy ? 'Finishing...' : 'Complete Workout'}</button>

      {swapFor && (
        <div className="modal-backdrop" onClick={() => !swapBusy && setSwapFor(null)}>
          <div className="swap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="swap-modal-head">
              <div><span className="eyebrow">REPLACE EXERCISE</span><h3>{swapFor.name}</h3></div>
              <button className="icon-button" onClick={() => setSwapFor(null)} disabled={swapBusy}><X size={20} /></button>
            </div>
            <p className="muted">Alternatives target the same muscle and movement pattern.</p>
            {swapBusy && alternatives.length === 0 ? <div className="modal-loading">Loading alternatives...</div> : (
              <div className="alternative-list">
                {alternatives.length === 0 && <div className="empty-card">No compatible alternatives found.</div>}
                {alternatives.map((alt) => (
                  <button className="alternative-card" key={alt.exercise.id} onClick={() => chooseAlternative(alt)} disabled={swapBusy}>
                    <div>
                      <strong>{alt.exercise.name_en}</strong>
                      {alt.exercise.name_ar && <span>{alt.exercise.name_ar}</span>}
                      <small>{alt.exercise.equipment} · {alt.exercise.movement_pattern}</small>
                    </div>
                    <RefreshCw size={18} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{suffix}</small></div>
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>{icon}<span>{label}</span></button>
}

export default App
