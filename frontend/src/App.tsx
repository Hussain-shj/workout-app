import { FormEvent, useEffect, useState } from 'react'
import { Activity, ArrowLeft, Check, Dumbbell, ExternalLink, History, Home, LogOut, Play, RefreshCw, Save, UserRound, X } from 'lucide-react'
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

type SetRow = { weight: string; reps: string; rir: string; saved?: boolean }

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [program, setProgram] = useState<Program | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [activeTab, setActiveTab] = useState<'home' | 'workout' | 'progress' | 'profile'>('home')
  const [selectedDay, setSelectedDay] = useState<ProgramDay | null>(null)
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null)
  const [activeWorkout, setActiveWorkout] = useState<StartedWorkout | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')

  const loadDashboard = async () => {
    const me = await api<User>('/auth/me')
    setUser(me)
    try {
      setProgram(await api<Program>('/program'))
    } catch {
      setProgram(null)
    }
    try {
      setHistory(await api<HistoryItem[]>('/workouts?limit=10'))
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
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} onAuthenticated={loadDashboard} />
  if (!program || !user.onboarding_complete) return <Onboarding user={user} onComplete={loadDashboard} />

  const today = program.days[0]
  const completedCount = history.filter((h) => h.completed_at).length
  const weeklyVolume = history.reduce((sum, item) => sum + Number(item.total_volume_kg || 0), 0)

  const openDay = (day: ProgramDay) => {
    setSelectedDay(day)
    setSelectedExerciseId(null)
    setActiveTab('workout')
  }

  const ensureWorkout = async (day: ProgramDay) => {
    if (activeWorkout && activeWorkout.day_name === day.name) return activeWorkout
    const started = await api<StartedWorkout>('/workouts/start', {
      method: 'POST',
      body: JSON.stringify({ program_day_id: day.id }),
    })
    setActiveWorkout(started)
    return started
  }

  const openExercise = async (day: ProgramDay, exerciseId: number) => {
    setError('')
    try {
      await ensureWorkout(day)
      setSelectedDay(day)
      setSelectedExerciseId(exerciseId)
      setActiveTab('workout')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open exercise')
    }
  }

  const goBack = () => {
    if (selectedExerciseId !== null) {
      setSelectedExerciseId(null)
      return
    }
    if (selectedDay) {
      setSelectedDay(null)
      return
    }
    setActiveTab('home')
  }

  const goTab = (tab: 'home' | 'workout' | 'progress' | 'profile') => {
    setActiveTab(tab)
    setSelectedExerciseId(null)
    if (tab !== 'workout') setSelectedDay(null)
  }

  const logout = () => {
    clearTokens()
    setUser(null)
    setProgram(null)
    setActiveWorkout(null)
  }

  const selectedWorkoutExercise = activeWorkout?.exercises.find((e) => e.exercise_id === selectedExerciseId) || null

  return (
    <div className="app-shell">
      <main className="content">
        {error && <div className="error-banner">{error}</div>}

        {activeTab === 'home' && (
          <section>
            <div className="topbar">
              <div><span className="eyebrow">WORKOUT APP</span><h1>Hi, {user.full_name.split(' ')[0]}</h1></div>
              <div className="avatar">{user.full_name.charAt(0).toUpperCase()}</div>
            </div>

            <div className="hero-card">
              <div className="hero-copy">
                <span className="pill">TODAY</span>
                <h2>{today?.name || 'Workout'}</h2>
                <p>{today?.exercises.length || 0} exercises · {today?.exercises.reduce((s, e) => s + e.target_sets, 0) || 0} sets</p>
              </div>
              <button className="primary-button" onClick={() => today && openDay(today)}><Play size={18} fill="currentColor" /> Open Workout</button>
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
                <button className="day-row" key={day.id} onClick={() => openDay(day)}>
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

        {activeTab === 'workout' && selectedExerciseId !== null && selectedDay && selectedWorkoutExercise && (
          <ExercisePage
            workout={activeWorkout!}
            exercise={selectedWorkoutExercise}
            onBack={goBack}
            onCompleted={() => setSelectedExerciseId(null)}
            onExerciseUpdated={(updated) => setActiveWorkout((prev) => prev ? { ...prev, exercises: prev.exercises.map((e) => e.exercise_session_id === updated.exercise_session_id ? updated : e) } : prev)}
          />
        )}

        {activeTab === 'workout' && selectedExerciseId === null && selectedDay && (
          <DayPage
            day={selectedDay}
            activeWorkout={activeWorkout && activeWorkout.day_name === selectedDay.name ? activeWorkout : null}
            onBack={goBack}
            onOpenExercise={(exerciseId) => openExercise(selectedDay, exerciseId)}
            onCompleteWorkout={async () => {
              if (!activeWorkout || activeWorkout.day_name !== selectedDay.name) {
                setSelectedDay(null)
                setActiveTab('home')
                return
              }
              await api(`/workouts/${activeWorkout.workout_session_id}/complete`, { method: 'POST', body: JSON.stringify({ notes: null }) })
              try { await api(`/workouts/${activeWorkout.workout_session_id}/progression`) } catch {}
              setActiveWorkout(null)
              setSelectedDay(null)
              await loadDashboard()
              setActiveTab('home')
            }}
          />
        )}

        {activeTab === 'workout' && !selectedDay && (
          <section>
            <PageHeader title="Choose workout" onBack={goBack} />
            <div className="day-list">
              {program.days.map((day) => (
                <button className="day-row" key={day.id} onClick={() => openDay(day)}>
                  <div><strong>{day.name}</strong><span>{day.exercises.length} exercises</span></div>
                  <Play size={18} />
                </button>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'progress' && (
          <section>
            <PageHeader title="Progress" subtitle="Recent sessions" onBack={goBack} />
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
            <PageHeader title="Profile" onBack={goBack} />
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
        <NavButton active={activeTab === 'home'} onClick={() => goTab('home')} icon={<Home size={21} />} label="Home" />
        <NavButton active={activeTab === 'workout'} onClick={() => goTab('workout')} icon={<Dumbbell size={21} />} label="Workout" />
        <NavButton active={activeTab === 'progress'} onClick={() => goTab('progress')} icon={<History size={21} />} label="Progress" />
        <NavButton active={activeTab === 'profile'} onClick={() => goTab('profile')} icon={<UserRound size={21} />} label="Profile" />
      </nav>
    </div>
  )
}

function PageHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="page-header">
      <button className="back-button" onClick={onBack}><ArrowLeft size={20} /></button>
      <div><h2>{title}</h2>{subtitle && <span>{subtitle}</span>}</div>
    </div>
  )
}

function DayPage({ day, activeWorkout, onBack, onOpenExercise, onCompleteWorkout }: {
  day: ProgramDay
  activeWorkout: StartedWorkout | null
  onBack: () => void
  onOpenExercise: (exerciseId: number) => void
  onCompleteWorkout: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <section>
      <PageHeader title={day.name} subtitle={`${day.exercises.length} exercises`} onBack={onBack} />
      <div className="day-exercise-list">
        {day.exercises.map((pe, index) => {
          const live = activeWorkout?.exercises.find((e) => e.exercise_id === pe.exercise.id)
          return (
            <button className="exercise-list-row" key={pe.id} onClick={() => onOpenExercise(pe.exercise.id)}>
              <div className="exercise-index">{index + 1}</div>
              <div className="exercise-list-copy">
                <strong>{live?.name || pe.exercise.name_en}</strong>
                {pe.exercise.name_ar && <span>{pe.exercise.name_ar}</span>}
                <small>{pe.target_sets} sets · {pe.target_rep_min}-{pe.target_rep_max} reps · RIR {pe.target_rir ?? 2}</small>
              </div>
              <span className="open-label">Open</span>
            </button>
          )
        })}
      </div>
      <button className="primary-button full finish-button" disabled={busy} onClick={async () => { setBusy(true); try { await onCompleteWorkout() } finally { setBusy(false) } }}>
        <Check size={18} /> {busy ? 'Completing...' : 'Complete Workout'}
      </button>
    </section>
  )
}

function ExercisePage({ workout, exercise, onBack, onCompleted, onExerciseUpdated }: {
  workout: StartedWorkout
  exercise: WorkoutExercise
  onBack: () => void
  onCompleted: () => void
  onExerciseUpdated: (exercise: WorkoutExercise) => void
}) {
  const [rows, setRows] = useState<SetRow[]>(() => Array.from({ length: exercise.target_sets }, () => ({ weight: '', reps: '', rir: String(exercise.target_rir ?? 2) })))
  const [notes, setNotes] = useState(exercise.notes || '')
  const [noteSaved, setNoteSaved] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [alternatives, setAlternatives] = useState<Alternative[]>([])
  const [swapBusy, setSwapBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const updateRow = (index: number, field: 'weight' | 'reps' | 'rir', value: string) => {
    setRows((prev) => prev.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  const saveSet = async (index: number) => {
    const row = rows[index]
    if (!row.weight || !row.reps || row.saved) return
    setError('')
    try {
      await api(`/workouts/${workout.workout_session_id}/sets`, {
        method: 'POST',
        body: JSON.stringify({ exercise_session_id: exercise.exercise_session_id, weight_kg: Number(row.weight), reps: Number(row.reps), rir: row.rir ? Number(row.rir) : null, completed: true }),
      })
      setRows((prev) => prev.map((r, i) => i === index ? { ...r, saved: true } : r))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save set')
    }
  }

  const saveNote = async () => {
    setError('')
    try {
      await api(`/workouts/${workout.workout_session_id}/exercises/${exercise.exercise_session_id}/notes`, {
        method: 'PUT', body: JSON.stringify({ notes: notes || null }),
      })
      setNoteSaved(true)
      window.setTimeout(() => setNoteSaved(false), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save note')
    }
  }

  const openSwap = async () => {
    if (rows.some((r) => r.saved)) return
    setSwapOpen(true)
    setSwapBusy(true)
    try {
      setAlternatives(await api<Alternative[]>(`/exercises/${exercise.exercise_id}/alternatives`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load alternatives')
      setSwapOpen(false)
    } finally {
      setSwapBusy(false)
    }
  }

  const chooseAlternative = async (alt: Alternative) => {
    setSwapBusy(true)
    try {
      const updated = await api<Partial<WorkoutExercise>>(`/workouts/${workout.workout_session_id}/exercises/${exercise.exercise_session_id}/swap`, {
        method: 'POST', body: JSON.stringify({ alternative_exercise_id: alt.exercise.id }),
      })
      onExerciseUpdated({
        ...exercise,
        exercise_id: updated.exercise_id ?? alt.exercise.id,
        name: updated.name ?? alt.exercise.name_en,
        name_ar: updated.name_ar ?? alt.exercise.name_ar,
        primary_muscle: updated.primary_muscle ?? alt.exercise.primary_muscle,
        movement_pattern: updated.movement_pattern ?? alt.exercise.movement_pattern,
        youtube_url: updated.youtube_url ?? alt.exercise.youtube_url,
        target_rep_min: updated.target_rep_min ?? exercise.target_rep_min,
        target_rep_max: updated.target_rep_max ?? exercise.target_rep_max,
      })
      setSwapOpen(false)
      setMessage('Exercise replaced successfully')
      window.setTimeout(() => setMessage(''), 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to replace exercise')
    } finally {
      setSwapBusy(false)
    }
  }

  const completeExercise = async () => {
    await saveNote()
    onCompleted()
  }

  return (
    <section>
      <PageHeader title={exercise.name} subtitle={`${exercise.target_sets} sets · ${exercise.target_rep_min}-${exercise.target_rep_max} reps`} onBack={onBack} />
      {error && <div className="error-banner workout-alert">{error}</div>}
      {message && <div className="success-banner workout-alert">{message}</div>}

      <div className="exercise-detail-card">
        {exercise.name_ar && <div className="exercise-ar detail-ar">{exercise.name_ar}</div>}
        <div className="exercise-meta-line">RIR target {exercise.target_rir ?? 2}{exercise.primary_muscle ? ` · ${exercise.primary_muscle}` : ''}</div>
        <div className="exercise-actions">
          {exercise.youtube_url && <a className="exercise-action youtube-action" href={exercise.youtube_url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> YouTube</a>}
          <button className="exercise-action" onClick={openSwap} disabled={rows.some((r) => r.saved)}><RefreshCw size={16} /> Replace</button>
        </div>
      </div>

      <div className="exercise-card single-exercise-card">
        <div className="set-table-head"><span>SET</span><span>KG</span><span>REPS</span><span>RIR</span><span></span></div>
        {rows.map((row, i) => (
          <div className="set-row" key={i}>
            <span>{i + 1}</span>
            <input inputMode="decimal" value={row.weight} onChange={(e) => updateRow(i, 'weight', e.target.value)} placeholder="0" />
            <input inputMode="numeric" value={row.reps} onChange={(e) => updateRow(i, 'reps', e.target.value)} placeholder="0" />
            <input inputMode="decimal" value={row.rir} onChange={(e) => updateRow(i, 'rir', e.target.value)} />
            <button className={row.saved ? 'set-done saved' : 'set-done'} onClick={() => saveSet(i)} disabled={row.saved}>{row.saved ? '✓' : '+'}</button>
          </div>
        ))}

        <div className="exercise-notes">
          <label>Exercise notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did this exercise feel? Pain, fatigue, form, difficulty..." maxLength={2000} />
          <button className="note-save" onClick={saveNote}><Save size={15} /> {noteSaved ? 'Saved' : 'Save note'}</button>
        </div>
      </div>

      <div className="exercise-page-actions">
        <button className="secondary-button full" onClick={onBack}><ArrowLeft size={18} /> Back</button>
        <button className="primary-button full" onClick={completeExercise}><Check size={18} /> Complete Exercise</button>
      </div>

      {swapOpen && (
        <div className="modal-backdrop" onClick={() => !swapBusy && setSwapOpen(false)}>
          <div className="swap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="swap-modal-head">
              <div><span className="eyebrow">REPLACE EXERCISE</span><h3>{exercise.name}</h3></div>
              <button className="icon-button" onClick={() => setSwapOpen(false)} disabled={swapBusy}><X size={20} /></button>
            </div>
            <p className="muted">Alternatives target the same muscle and movement pattern.</p>
            {swapBusy ? <div className="modal-loading">Loading alternatives...</div> : (
              <div className="alternative-list">
                {alternatives.length === 0 && <div className="empty-card">No compatible alternatives found.</div>}
                {alternatives.map((alt) => (
                  <button className="alternative-card" key={alt.exercise.id} onClick={() => chooseAlternative(alt)}>
                    <div><strong>{alt.exercise.name_en}</strong>{alt.exercise.name_ar && <span>{alt.exercise.name_ar}</span>}<small>{alt.exercise.equipment} · {alt.exercise.movement_pattern}</small></div>
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

function AuthScreen({ mode, setMode, onAuthenticated }: { mode: 'login' | 'register'; setMode: (m: 'login' | 'register') => void; onAuthenticated: () => Promise<void> }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register'
      const body = mode === 'login' ? { email, password } : { full_name: fullName, email, password }
      const tokens = await api<{ access_token: string; refresh_token: string }>(path, { method: 'POST', auth: false, body: JSON.stringify(body) })
      saveTokens(tokens.access_token, tokens.refresh_token)
      await onAuthenticated()
    } catch (e) { setError(e instanceof Error ? e.message : 'Authentication failed') } finally { setBusy(false) }
  }

  return (
    <div className="auth-screen">
      <div className="brand-mark"><Dumbbell size={28} /></div><span className="eyebrow">ADAPTIVE TRAINING SYSTEM</span><h1>Workout APP</h1><p className="muted">Train. Track. Adapt. Progress.</p>
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
        {mode === 'register' && <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button full" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}</button>
        <button type="button" className="text-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'New here? Create account' : 'Already have an account? Login'}</button>
      </form>
    </div>
  )
}

function Onboarding({ user, onComplete }: { user: User; onComplete: () => Promise<void> }) {
  const [days, setDays] = useState<3 | 5>(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generate = async () => {
    setBusy(true); setError('')
    try { await api('/program/generate', { method: 'POST', body: JSON.stringify({ training_days: days }) }); await onComplete() }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to generate program') }
    finally { setBusy(false) }
  }
  return (
    <div className="onboarding-screen">
      <span className="eyebrow">WELCOME, {user.full_name.split(' ')[0].toUpperCase()}</span><h1>How many days do you want to train?</h1><p className="muted">We will generate your starting program. You can change it later.</p>
      <div className="choice-grid">
        <button className={days === 3 ? 'choice-card active' : 'choice-card'} onClick={() => setDays(3)}><strong>3 Days</strong><span>Push · Pull · Legs</span></button>
        <button className={days === 5 ? 'choice-card active' : 'choice-card'} onClick={() => setDays(5)}><strong>5 Days</strong><span>Push · Pull · Legs · Upper · Lower</span></button>
      </div>
      {error && <div className="form-error">{error}</div>}<button className="primary-button full" onClick={generate} disabled={busy}>{busy ? 'Building your program...' : 'Generate My Program'}</button>
    </div>
  )
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{suffix}</small></div>
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>{icon}<span>{label}</span></button>
}

export default App
