import { FormEvent, useEffect, useState } from 'react'
import { ArrowLeft, Check, Dumbbell, ExternalLink, History, Home, LogOut, Play, Plus, RefreshCw, Save, Trash2, UserRound, X } from 'lucide-react'
import { api, clearTokens, getAccessToken, saveTokens } from './api'
import { exerciseImageUrl, fallbackExerciseImage } from './exerciseImages'

type User = { id:number; full_name:string; email:string; onboarding_complete:boolean; available_training_days:number|null }
type Exercise = { id:number; name_en:string; name_ar?:string|null; primary_muscle:string; secondary_muscles?:string|null; movement_pattern?:string; equipment?:string; youtube_url?:string|null }
type ProgramExercise = { id:number; target_sets:number; target_rep_min:number; target_rep_max:number; target_rir:number|null; exercise:Exercise }
type ProgramDay = { id:number; day_order:number; name:string; exercises:ProgramExercise[] }
type Program = { id:number; name:string; training_days_per_week:number; days:ProgramDay[] }
type SavedSet = { id:number; set_number:number; weight_kg:number; reps:number; rir:number|null; rpe?:number|null; completed:boolean }
type WorkoutExercise = { exercise_session_id:number; exercise_id:number; name:string; name_ar?:string|null; primary_muscle?:string; movement_pattern?:string; youtube_url?:string|null; target_sets:number; target_rep_min:number; target_rep_max:number; target_rir:number|null; notes?:string|null; sets?:SavedSet[] }
type StartedWorkout = { workout_session_id:number; day_name:string; exercises:WorkoutExercise[] }
type HistoryItem = { id:number; workout_date:string; duration_minutes:number|null; total_volume_kg:number; completed_at:string|null }
type Alternative = { exercise:Exercise; priority:number; reason?:string|null }
type SetRow = { id?:number; weight:string; reps:string; rir:string; saved?:boolean; dirty?:boolean }
type Tab = 'home'|'workout'|'progress'|'profile'

function Img({ name, className='exercise-image' }: { name:string; className?:string }) {
  return <img className={className} src={exerciseImageUrl(name)} alt={name} loading="lazy" onError={(e)=>{ if (e.currentTarget.src !== fallbackExerciseImage) e.currentTarget.src = fallbackExerciseImage }} />
}

function App() {
  const [user,setUser]=useState<User|null>(null)
  const [program,setProgram]=useState<Program|null>(null)
  const [history,setHistory]=useState<HistoryItem[]>([])
  const [activeTab,setActiveTab]=useState<Tab>('home')
  const [selectedDay,setSelectedDay]=useState<ProgramDay|null>(null)
  const [selectedExerciseSessionId,setSelectedExerciseSessionId]=useState<number|null>(null)
  const [activeWorkout,setActiveWorkout]=useState<StartedWorkout|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [authMode,setAuthMode]=useState<'login'|'register'>('login')

  const loadDashboard=async()=>{
    const me=await api<User>('/auth/me'); setUser(me)
    try{ setProgram(await api<Program>('/program')) }catch{ setProgram(null) }
    try{ setHistory(await api<HistoryItem[]>('/workouts?limit=10')) }catch{ setHistory([]) }
  }

  useEffect(()=>{;(async()=>{ if(!getAccessToken()){setLoading(false);return} try{await loadDashboard()}catch{clearTokens()}finally{setLoading(false)} })()},[])

  if(loading) return <div className="screen center"><div className="loader"/></div>
  if(!user) return <AuthScreen mode={authMode} setMode={setAuthMode} onAuthenticated={loadDashboard}/>
  if(!program||!user.onboarding_complete) return <Onboarding user={user} onComplete={loadDashboard}/>

  const today=program.days[0]
  const completedCount=history.filter(h=>h.completed_at).length
  const weeklyVolume=history.reduce((s,h)=>s+Number(h.total_volume_kg||0),0)

  const openDay=(day:ProgramDay)=>{setSelectedDay(day);setSelectedExerciseSessionId(null);setActiveTab('workout')}
  const ensureWorkout=async(day:ProgramDay)=>{
    if(activeWorkout&&activeWorkout.day_name===day.name) return activeWorkout
    const started=await api<StartedWorkout>('/workouts/start',{method:'POST',body:JSON.stringify({program_day_id:day.id})})
    setActiveWorkout(started); return started
  }
  const openExercise=async(day:ProgramDay, programExercise:ProgramExercise)=>{
    setError('')
    try{
      const workout=await ensureWorkout(day)
      const live=workout.exercises.find(e=>e.exercise_id===programExercise.exercise.id) || workout.exercises.find((_,i)=>day.exercises[i]?.id===programExercise.id)
      if(!live) throw new Error('Exercise session not found')
      setSelectedDay(day); setSelectedExerciseSessionId(live.exercise_session_id); setActiveTab('workout')
    }catch(e){setError(e instanceof Error?e.message:'Unable to open exercise')}
  }

  const selectedWorkoutExercise=activeWorkout?.exercises.find(e=>e.exercise_session_id===selectedExerciseSessionId)||null
  const goBack=()=>{if(selectedExerciseSessionId!==null){setSelectedExerciseSessionId(null);return}if(selectedDay){setSelectedDay(null);return}setActiveTab('home')}
  const goTab=(tab:Tab)=>{setActiveTab(tab);setSelectedExerciseSessionId(null);if(tab!=='workout')setSelectedDay(null)}
  const logout=()=>{clearTokens();setUser(null);setProgram(null);setActiveWorkout(null)}
  const updateLiveExercise=(updated:WorkoutExercise)=>{
    const oldExerciseId=selectedWorkoutExercise?.exercise_id
    setActiveWorkout(prev=>prev?{...prev,exercises:prev.exercises.map(e=>e.exercise_session_id===updated.exercise_session_id?updated:e)}:prev)
    if(oldExerciseId!==updated.exercise_id){
      setProgram(prev=>prev?{...prev,days:prev.days.map(day=>({...day,exercises:day.exercises.map(pe=>pe.exercise.id===oldExerciseId?{...pe,exercise:{...pe.exercise,id:updated.exercise_id,name_en:updated.name,name_ar:updated.name_ar,primary_muscle:updated.primary_muscle||pe.exercise.primary_muscle,movement_pattern:updated.movement_pattern,youtube_url:updated.youtube_url},target_rep_min:updated.target_rep_min,target_rep_max:updated.target_rep_max}:pe)}))}:prev)
    }
  }

  return <div className="app-shell"><main className="content">{error&&<div className="error-banner">{error}</div>}
    {activeTab==='home'&&<section><div className="topbar"><div><span className="eyebrow">WORKOUT APP</span><h1>Hi, {user.full_name.split(' ')[0]}</h1></div><div className="avatar">{user.full_name[0].toUpperCase()}</div></div><div className="hero-card"><div className="hero-copy"><span className="pill">TODAY</span><h2>{today?.name||'Workout'}</h2><p>{today?.exercises.length||0} exercises · {today?.exercises.reduce((s,e)=>s+e.target_sets,0)||0} sets</p></div><button className="primary-button" onClick={()=>today&&openDay(today)}><Play size={18}/> Open Workout</button></div><div className="stats-grid"><StatCard label="Workouts" value={`${completedCount}`} suffix="recent"/><StatCard label="Volume" value={`${Math.round(weeklyVolume).toLocaleString()}`} suffix="kg"/><StatCard label="Program" value={`${program.training_days_per_week}`} suffix="days/week"/><StatCard label="Status" value="Ready" suffix="adaptive"/></div><div className="section-header"><h3>Your program</h3><span>{program.name}</span></div><div className="day-list">{program.days.map(day=><button className="day-row" key={day.id} onClick={()=>openDay(day)}><div><strong>{day.day_order}. {day.name}</strong><span>{day.exercises.map(e=>e.exercise.primary_muscle).filter((v,i,a)=>a.indexOf(v)===i).join(' · ')}</span></div><span>{day.exercises.length} exercises</span></button>)}</div></section>}
    {activeTab==='workout'&&selectedExerciseSessionId!==null&&selectedDay&&selectedWorkoutExercise&&<ExercisePage workout={activeWorkout!} exercise={selectedWorkoutExercise} onBack={goBack} onCompleted={()=>setSelectedExerciseSessionId(null)} onExerciseUpdated={updateLiveExercise}/>} 
    {activeTab==='workout'&&selectedExerciseSessionId===null&&selectedDay&&<DayPage day={selectedDay} activeWorkout={activeWorkout&&activeWorkout.day_name===selectedDay.name?activeWorkout:null} onBack={goBack} onOpenExercise={(pe)=>openExercise(selectedDay,pe)} onCompleteWorkout={async()=>{if(!activeWorkout||activeWorkout.day_name!==selectedDay.name){setSelectedDay(null);setActiveTab('home');return}await api(`/workouts/${activeWorkout.workout_session_id}/complete`,{method:'POST',body:JSON.stringify({notes:null})});try{await api(`/workouts/${activeWorkout.workout_session_id}/progression`)}catch{}setActiveWorkout(null);setSelectedDay(null);await loadDashboard();setActiveTab('home')}}/>}
    {activeTab==='workout'&&!selectedDay&&<section><PageHeader title="Choose workout" onBack={goBack}/><div className="day-list">{program.days.map(day=><button className="day-row" key={day.id} onClick={()=>openDay(day)}><div><strong>{day.name}</strong><span>{day.exercises.length} exercises</span></div><Play size={18}/></button>)}</div></section>}
    {activeTab==='progress'&&<section><PageHeader title="Progress" subtitle="Recent sessions" onBack={goBack}/><div className="history-list">{history.length===0&&<div className="empty-card">Complete your first workout to see progress.</div>}{history.map(item=><div className="history-row" key={item.id}><div><strong>{item.workout_date}</strong><span>{item.duration_minutes||0} min</span></div><div className="history-volume">{Math.round(item.total_volume_kg||0).toLocaleString()} kg</div></div>)}</div></section>}
    {activeTab==='profile'&&<section><PageHeader title="Profile" onBack={goBack}/><div className="profile-card"><div className="large-avatar">{user.full_name[0].toUpperCase()}</div><h2>{user.full_name}</h2><p>{user.email}</p><div className="profile-meta"><span>{program.training_days_per_week} training days</span><span>Adaptive program active</span></div><button className="secondary-button danger" onClick={logout}><LogOut size={18}/> Logout</button></div></section>}
  </main><nav className="bottom-nav"><NavButton active={activeTab==='home'} onClick={()=>goTab('home')} icon={<Home size={21}/>} label="Home"/><NavButton active={activeTab==='workout'} onClick={()=>goTab('workout')} icon={<Dumbbell size={21}/>} label="Workout"/><NavButton active={activeTab==='progress'} onClick={()=>goTab('progress')} icon={<History size={21}/>} label="Progress"/><NavButton active={activeTab==='profile'} onClick={()=>goTab('profile')} icon={<UserRound size={21}/>} label="Profile"/></nav></div>
}

function PageHeader({title,subtitle,onBack}:{title:string;subtitle?:string;onBack:()=>void}){return <div className="page-header"><button className="back-button" onClick={onBack}><ArrowLeft size={20}/></button><div><h2>{title}</h2>{subtitle&&<span>{subtitle}</span>}</div></div>}
function DayPage({day,activeWorkout,onBack,onOpenExercise,onCompleteWorkout}:{day:ProgramDay;activeWorkout:StartedWorkout|null;onBack:()=>void;onOpenExercise:(pe:ProgramExercise)=>void;onCompleteWorkout:()=>Promise<void>}){const[busy,setBusy]=useState(false);return <section><PageHeader title={day.name} subtitle={`${day.exercises.length} exercises`} onBack={onBack}/><div className="day-exercise-list">{day.exercises.map((pe,index)=>{const live=activeWorkout?.exercises[index];const displayName=live?.name||pe.exercise.name_en;const completedSets=live?.sets?.length||0;return <button className="exercise-list-row image-row" key={pe.id} onClick={()=>onOpenExercise(pe)}><Img name={displayName} className="exercise-thumb"/><div className="exercise-list-copy"><strong>{displayName}</strong>{(live?.name_ar||pe.exercise.name_ar)&&<span>{live?.name_ar||pe.exercise.name_ar}</span>}<small>{pe.target_sets} sets · {pe.target_rep_min}-{pe.target_rep_max} reps · RIR {pe.target_rir??2}{completedSets>0?` · ${completedSets} saved`:''}</small></div><span className="open-label">Open</span></button>})}</div><button className="primary-button full finish-button" disabled={busy} onClick={async()=>{setBusy(true);try{await onCompleteWorkout()}finally{setBusy(false)}}}><Check size={18}/>{busy?'Completing...':'Complete Workout'}</button></section>}

function ExercisePage({workout,exercise,onBack,onCompleted,onExerciseUpdated}:{workout:StartedWorkout;exercise:WorkoutExercise;onBack:()=>void;onCompleted:()=>void;onExerciseUpdated:(exercise:WorkoutExercise)=>void}){
  const emptyRow=():SetRow=>({weight:'',reps:'',rir:String(exercise.target_rir??2),saved:false,dirty:false})
  const rowsFromExercise=()=>{
    const saved: SetRow[]=(exercise.sets||[]).map(s=>({id:s.id,weight:String(s.weight_kg),reps:String(s.reps),rir:String(s.rir??exercise.target_rir??2),saved:true,dirty:false}))
    const blanks=Math.max(0,exercise.target_sets-saved.length)
    return [...saved,...Array.from({length:blanks},emptyRow)]
  }
  const[rows,setRows]=useState<SetRow[]>(rowsFromExercise)
  const[notes,setNotes]=useState(exercise.notes||'')
  const[noteSaved,setNoteSaved]=useState(false)
  const[swapOpen,setSwapOpen]=useState(false)
  const[alternatives,setAlternatives]=useState<Alternative[]>([])
  const[swapBusy,setSwapBusy]=useState(false)
  const[error,setError]=useState('')
  const[message,setMessage]=useState('')

  useEffect(()=>{setRows(rowsFromExercise());setNotes(exercise.notes||'')},[exercise.exercise_session_id,exercise.exercise_id])

  const syncParent=(nextRows:SetRow[],nextNotes=notes)=>{
    const savedSets:SavedSet[]=nextRows.filter(r=>r.id).map((r,index)=>({id:r.id!,set_number:index+1,weight_kg:Number(r.weight),reps:Number(r.reps),rir:r.rir===''?null:Number(r.rir),completed:true}))
    onExerciseUpdated({...exercise,notes:nextNotes,sets:savedSets})
  }
  const updateRow=(i:number,f:'weight'|'reps'|'rir',v:string)=>{setRows(p=>p.map((r,x)=>x===i?{...r,[f]:v,dirty:true}:r));setError('')}
  const addSet=()=>{setRows(prev=>[...prev,emptyRow()]);setError('')}
  const validateRow=(r:SetRow,i:number)=>{
    const weight=r.weight.trim(),reps=r.reps.trim(),rir=r.rir.trim()
    if(!weight||!reps||!rir){setError(`Set ${i+1}: enter KG, reps and RIR before saving.`);return null}
    const weightNum=Number(weight),repsNum=Number(reps),rirNum=Number(rir)
    if(!Number.isFinite(weightNum)||weightNum<0){setError(`Set ${i+1}: enter a valid weight.`);return null}
    if(!Number.isInteger(repsNum)||repsNum<=0){setError(`Set ${i+1}: reps must be at least 1.`);return null}
    if(!Number.isFinite(rirNum)||rirNum<0||rirNum>10){setError(`Set ${i+1}: RIR must be between 0 and 10.`);return null}
    return {weightNum,repsNum,rirNum}
  }
  const saveSet=async(i:number)=>{
    const r=rows[i];const values=validateRow(r,i);if(!values)return
    setError('')
    try{
      const response=r.id
        ? await api<SavedSet>(`/workouts/${workout.workout_session_id}/sets/${r.id}`,{method:'PUT',body:JSON.stringify({weight_kg:values.weightNum,reps:values.repsNum,rir:values.rirNum,completed:true})})
        : await api<SavedSet>(`/workouts/${workout.workout_session_id}/sets`,{method:'POST',body:JSON.stringify({exercise_session_id:exercise.exercise_session_id,weight_kg:values.weightNum,reps:values.repsNum,rir:values.rirNum,completed:true})})
      const next=rows.map((x,n)=>n===i?{id:response.id,weight:String(response.weight_kg),reps:String(response.reps),rir:String(response.rir??values.rirNum),saved:true,dirty:false}:x)
      setRows(next);syncParent(next);setMessage(r.id?'Set updated':'Set saved');setTimeout(()=>setMessage(''),1200)
    }catch(e){setError(e instanceof Error?e.message:'Unable to save set')}
  }
  const deleteSet=async(i:number)=>{
    const r=rows[i];setError('')
    try{
      if(r.id) await api<void>(`/workouts/${workout.workout_session_id}/sets/${r.id}`,{method:'DELETE'})
      const next=rows.filter((_,index)=>index!==i)
      setRows(next);syncParent(next);setMessage('Set deleted');setTimeout(()=>setMessage(''),1200)
    }catch(e){setError(e instanceof Error?e.message:'Unable to delete set')}
  }
  const saveNote=async()=>{setError('');try{await api(`/workouts/${workout.workout_session_id}/exercises/${exercise.exercise_session_id}/notes`,{method:'PUT',body:JSON.stringify({notes:notes||null})});onExerciseUpdated({...exercise,notes,sets:rows.filter(r=>r.id).map((r,index)=>({id:r.id!,set_number:index+1,weight_kg:Number(r.weight),reps:Number(r.reps),rir:Number(r.rir),completed:true}))});setNoteSaved(true);setTimeout(()=>setNoteSaved(false),1500)}catch(e){setError(e instanceof Error?e.message:'Unable to save note')}}
  const openSwap=async()=>{if(rows.some(r=>r.id)){setError('Delete the saved sets first if you want to replace this exercise.');return}setError('');setSwapOpen(true);setSwapBusy(true);try{setAlternatives(await api<Alternative[]>(`/exercises/${exercise.exercise_id}/alternatives`))}catch(e){setError(e instanceof Error?e.message:'Unable to load alternatives');setSwapOpen(false)}finally{setSwapBusy(false)}}
  const chooseAlternative=async(alt:Alternative)=>{setSwapBusy(true);setError('');try{const updated=await api<Partial<WorkoutExercise>>(`/workouts/${workout.workout_session_id}/exercises/${exercise.exercise_session_id}/swap`,{method:'POST',body:JSON.stringify({alternative_exercise_id:alt.exercise.id})});const next:WorkoutExercise={...exercise,exercise_id:updated.exercise_id??alt.exercise.id,name:updated.name??alt.exercise.name_en,name_ar:updated.name_ar??alt.exercise.name_ar,primary_muscle:updated.primary_muscle??alt.exercise.primary_muscle,movement_pattern:updated.movement_pattern??alt.exercise.movement_pattern,youtube_url:updated.youtube_url??alt.exercise.youtube_url,target_rep_min:updated.target_rep_min??exercise.target_rep_min,target_rep_max:updated.target_rep_max??exercise.target_rep_max,sets:[]};onExerciseUpdated(next);setSwapOpen(false);setAlternatives([]);setMessage(`Changed to ${next.name}`);setTimeout(()=>setMessage(''),2200)}catch(e){setError(e instanceof Error?e.message:'Unable to replace exercise')}finally{setSwapBusy(false)}}
  const completeExercise=async()=>{if(!rows.some(r=>r.id)){setError('Save at least one set before completing the exercise.');return}if(rows.some(r=>r.id&&r.dirty)){setError('Save your edited sets before completing the exercise.');return}await saveNote();onCompleted()}

  return <section><PageHeader title={exercise.name} subtitle={`${exercise.target_sets} target sets · ${exercise.target_rep_min}-${exercise.target_rep_max} reps`} onBack={onBack}/>{error&&<div className="error-banner workout-alert">{error}</div>}{message&&<div className="success-banner workout-alert">{message}</div>}
    <div className="exercise-detail-card"><Img name={exercise.name} className="exercise-hero-image"/>{exercise.name_ar&&<div className="exercise-ar detail-ar">{exercise.name_ar}</div>}<div className="exercise-meta-line">RIR target {exercise.target_rir??2}{exercise.primary_muscle?` · ${exercise.primary_muscle}`:''}</div><div className="exercise-actions">{exercise.youtube_url&&<a className="exercise-action youtube-action" href={exercise.youtube_url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> YouTube</a>}<button className="exercise-action" onClick={openSwap}><RefreshCw size={16}/> Replace Exercise</button></div></div>
    <div className="exercise-card single-exercise-card"><div className="set-table-head editable-head"><span>SET</span><span>KG</span><span>REPS</span><span>RIR</span><span>ACTIONS</span></div>{rows.map((r,i)=><div className="set-row editable-set-row" key={r.id??`new-${i}`}><span>{i+1}</span><input inputMode="decimal" value={r.weight} onChange={e=>updateRow(i,'weight',e.target.value)} placeholder="KG"/><input inputMode="numeric" value={r.reps} onChange={e=>updateRow(i,'reps',e.target.value)} placeholder="Reps"/><input inputMode="decimal" value={r.rir} onChange={e=>updateRow(i,'rir',e.target.value)} placeholder="RIR"/><div className="set-actions"><button className={r.id&&!r.dirty?'set-save saved':'set-save'} onClick={()=>saveSet(i)} title={r.id?'Save changes':'Save set'}><Save size={15}/></button><button className="set-delete" onClick={()=>deleteSet(i)} title="Delete set"><Trash2 size={15}/></button></div></div>)}
      <button type="button" className="add-set-button" onClick={addSet}><Plus size={17}/> Add Set</button>
      <div className="exercise-notes"><label>Exercise notes</label><textarea value={notes} onChange={e=>{setNotes(e.target.value);setNoteSaved(false)}} placeholder="How did this exercise feel? Pain, fatigue, form, difficulty..." maxLength={2000}/><button className="note-save" onClick={saveNote}><Save size={15}/>{noteSaved?'Saved':'Save note'}</button></div></div>
    <div className="exercise-page-actions"><button className="secondary-button full" onClick={onBack}><ArrowLeft size={18}/> Back</button><button className="primary-button full" onClick={completeExercise}><Check size={18}/> Complete Exercise</button></div>
    {swapOpen&&<div className="modal-backdrop" onClick={()=>!swapBusy&&setSwapOpen(false)}><div className="swap-modal" onClick={e=>e.stopPropagation()}><div className="swap-modal-head"><div><span className="eyebrow">REPLACE EXERCISE</span><h3>{exercise.name}</h3></div><button className="icon-button" onClick={()=>setSwapOpen(false)} disabled={swapBusy}><X size={20}/></button></div><p className="muted">Choose a compatible exercise for the same muscle and movement pattern.</p>{swapBusy?<div className="modal-loading">Loading alternatives...</div>:<div className="alternative-list">{alternatives.length===0&&<div className="empty-card">No compatible alternatives found.</div>}{alternatives.map(alt=><button className="alternative-card image-alt" key={alt.exercise.id} onClick={()=>chooseAlternative(alt)} disabled={swapBusy}><Img name={alt.exercise.name_en} className="alternative-thumb"/><div><strong>{alt.exercise.name_en}</strong>{alt.exercise.name_ar&&<span>{alt.exercise.name_ar}</span>}<small>{alt.exercise.equipment} · {alt.exercise.movement_pattern}</small></div><RefreshCw size={18}/></button>)}</div>}</div></div>}
  </section>
}

function AuthScreen({mode,setMode,onAuthenticated}:{mode:'login'|'register';setMode:(m:'login'|'register')=>void;onAuthenticated:()=>Promise<void>}){const[fullName,setFullName]=useState('');const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const path=mode==='login'?'/auth/login':'/auth/register';const body=mode==='login'?{email,password}:{full_name:fullName,email,password};const tokens=await api<{access_token:string;refresh_token:string}>(path,{method:'POST',auth:false,body:JSON.stringify(body)});saveTokens(tokens.access_token,tokens.refresh_token);await onAuthenticated()}catch(e){setError(e instanceof Error?e.message:'Authentication failed')}finally{setBusy(false)}};return <div className="auth-screen"><div className="brand-mark"><Dumbbell size={28}/></div><span className="eyebrow">ADAPTIVE TRAINING SYSTEM</span><h1>Workout APP</h1><p className="muted">Train. Track. Adapt. Progress.</p><form className="auth-card" onSubmit={submit}><h2>{mode==='login'?'Welcome back':'Create account'}</h2>{mode==='register'&&<input placeholder="Full name" value={fullName} onChange={e=>setFullName(e.target.value)} required/>}<input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required/>{error&&<div className="form-error">{error}</div>}<button className="primary-button full" disabled={busy}>{busy?'Please wait...':mode==='login'?'Login':'Create account'}</button><button type="button" className="text-button" onClick={()=>setMode(mode==='login'?'register':'login')}>{mode==='login'?'New here? Create account':'Already have an account? Login'}</button></form></div>}
function Onboarding({user,onComplete}:{user:User;onComplete:()=>Promise<void>}){const[days,setDays]=useState<3|5>(3);const[busy,setBusy]=useState(false);const[error,setError]=useState('');const generate=async()=>{setBusy(true);setError('');try{await api('/program/generate',{method:'POST',body:JSON.stringify({training_days:days})});await onComplete()}catch(e){setError(e instanceof Error?e.message:'Unable to generate program')}finally{setBusy(false)}};return <div className="onboarding-screen"><span className="eyebrow">WELCOME, {user.full_name.split(' ')[0].toUpperCase()}</span><h1>How many days do you want to train?</h1><p className="muted">We will generate your starting program. You can change it later.</p><div className="choice-grid"><button className={days===3?'choice-card active':'choice-card'} onClick={()=>setDays(3)}><strong>3 Days</strong><span>Push · Pull · Legs</span></button><button className={days===5?'choice-card active':'choice-card'} onClick={()=>setDays(5)}><strong>5 Days</strong><span>Push · Pull · Legs · Upper · Lower</span></button></div>{error&&<div className="form-error">{error}</div>}<button className="primary-button full" onClick={generate} disabled={busy}>{busy?'Building your program...':'Generate My Program'}</button></div>}
function StatCard({label,value,suffix}:{label:string;value:string;suffix:string}){return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{suffix}</small></div>}
function NavButton({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string}){return <button className={active?'nav-button active':'nav-button'} onClick={onClick}>{icon}<span>{label}</span></button>}
export default App
