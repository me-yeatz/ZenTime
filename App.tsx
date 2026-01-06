
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Task, TaskCategory, TaskPriority, AIAdvice, ChatMessage, UserProfile, GeneralNote } from './types';
import { optimizeSchedule, getAIResponse } from './services/aiService';
import { 
  PlusIcon, SparklesIcon, CheckCircleIcon, ClockIcon, TrashIcon, 
  MessageSquareIcon, BellIcon, StickyNoteIcon, ChevronRightIcon,
  SearchIcon, TerminalIcon, Volume2Icon, XIcon, HashIcon,
  ZapIcon, BookOpenIcon, CommandIcon, CpuIcon, AlertCircleIcon,
  Wand2Icon, UserIcon, Edit3Icon, SaveIcon, LayoutIcon
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const SLASH_COMMANDS = [
  { cmd: '/task', desc: 'Create a new task', placeholder: '/task [title] [category]' },
  { cmd: '/note', desc: 'Add notes to a task', placeholder: '/note [task name] [content]' },
  { cmd: '/alarm', desc: 'Set an alarm', placeholder: '/alarm [task name] [HH:mm]' },
  { cmd: '/optimize', desc: 'Let AI optimize your day', placeholder: '/optimize' }
];

const NOTE_COLORS = ['#d1e8e2', '#f9d5e5', '#eeeeee', '#fff4e6', '#f3f0ff'];

const App: React.FC = () => {
  // Persistence Loading
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('zentime-tasks-v2');
    return saved ? JSON.parse(saved) : [];
  });
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('zentime-profile');
    return saved ? JSON.parse(saved) : { name: 'User', mantra: 'Stay focused, stay calm.', joinedDate: Date.now() };
  });
  const [generalNotes, setGeneralNotes] = useState<GeneralNote[]>(() => {
    const saved = localStorage.getItem('zentime-general-notes');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackNotes, setFeedbackNotes] = useState(() => {
    return localStorage.getItem('zentime-feedback') || '';
  });
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeAlarm, setActiveAlarm] = useState<Task | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Slash Command State
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('zentime-tasks-v2', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('zentime-profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('zentime-general-notes', JSON.stringify(generalNotes));
  }, [generalNotes]);

  useEffect(() => {
    localStorage.setItem('zentime-feedback', feedbackNotes);
  }, [feedbackNotes]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const ringing = tasks.find(t => t.alarmEnabled && t.reminderTime === timeStr && !t.completed);
      if (ringing && activeAlarm?.id !== ringing.id) {
        setActiveAlarm(ringing);
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [tasks, activeAlarm]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const addTask = (title: string, category: TaskCategory, duration: number, notes?: string, alarmTime?: string) => {
    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      notes: notes || '',
      category,
      priority: TaskPriority.MEDIUM,
      estimatedDuration: duration,
      reminderTime: alarmTime,
      alarmEnabled: !!alarmTime,
      completed: false,
      createdAt: Date.now(),
    };
    setTasks(prev => [...prev, newTask]);
    return newTask;
  };

  const addGeneralNote = () => {
    const newNote: GeneralNote = {
      id: crypto.randomUUID(),
      content: 'New productivity thought...',
      createdAt: Date.now(),
      color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)]
    };
    setGeneralNotes(prev => [newNote, ...prev]);
  };

  const updateGeneralNote = (id: string, content: string) => {
    setGeneralNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));
  };

  const deleteGeneralNote = (id: string) => {
    setGeneralNotes(prev => prev.filter(n => n.id !== id));
  };

  const handleAiCommand = async (customMessage?: string) => {
    const finalInput = customMessage || userInput;
    if (!finalInput.trim()) return;

    setChatHistory(prev => [...prev, { role: 'user', text: finalInput }]);
    setUserInput('');
    setShowSuggestions(false);
    setIsAiLoading(true);

    try {
      const response = await getAIResponse(finalInput, tasks);
      const parts = response.candidates[0].content.parts;
      
      let modelResponseText = "";

      for (const part of parts) {
        if (part.text) {
          modelResponseText += part.text;
        }
        if (part.functionCall) {
          const { name, args } = part.functionCall;
          if (name === 'create_task') {
            const t = addTask(args.title, args.category as TaskCategory, args.duration, args.notes, args.alarmTime);
            modelResponseText += `\n[System: Created task "${t.title}"]`;
          } else if (name === 'update_task_notes') {
            setTasks(prev => prev.map(t => 
              t.title.toLowerCase().includes(args.taskTitle.toLowerCase()) 
              ? { ...t, notes: args.notes, estimatedDuration: args.duration || t.estimatedDuration } : t
            ));
            modelResponseText += `\n[System: Optimized "${args.taskTitle}"]`;
          } else if (name === 'set_alarm') {
            setTasks(prev => prev.map(t => 
              t.title.toLowerCase().includes(args.taskTitle.toLowerCase()) 
              ? { ...t, reminderTime: args.time, alarmEnabled: true } : t
            ));
            modelResponseText += `\n[System: Reminder set for ${args.time}]`;
          }
        }
      }

      setChatHistory(prev => [...prev, { role: 'model', text: modelResponseText || "I've updated your schedule accordingly." }]);
    } catch (err: any) {
      let errorMessage = "Error connecting to AI. Please try again.";

      // Check if it's an API key error
      if (err.message && err.message.includes("API key")) {
        errorMessage = "API key not configured. Please go to Settings to add your API key.";
      } else if (err.message) {
        errorMessage = `Error: ${err.message}`;
      }

      setChatHistory(prev => [...prev, { role: 'model', text: errorMessage }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUserInput(val);

    if (val.startsWith('/')) {
      setShowSuggestions(true);
      const search = val.toLowerCase();
      const matchIndex = SLASH_COMMANDS.findIndex(c => c.cmd.startsWith(search));
      if (matchIndex !== -1) setSuggestionIndex(matchIndex);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev + 1) % SLASH_COMMANDS.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex((prev) => (prev - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        setUserInput(SLASH_COMMANDS[suggestionIndex].cmd + ' ');
        setShowSuggestions(false);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  };

  const selectSuggestion = (index: number) => {
    setUserInput(SLASH_COMMANDS[index].cmd + ' ');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const COLORS = ['#d1e8e2', '#f9d5e5', '#eeeeee', '#ffffff'];

  const categoryStats = useMemo(() => {
    return Object.values(TaskCategory).map(cat => ({
      name: cat,
      value: tasks.filter(t => t.category === cat).length
    })).filter(d => d.value > 0);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return tasks;
    return tasks.filter(t => 
      t.title.toLowerCase().includes(query) || 
      t.notes?.toLowerCase().includes(query)
    );
  }, [tasks, searchQuery]);

  return (
    <div id="home" className="w-full min-h-screen p-4 md:p-6 lg:p-8 flex flex-col gap-6 lg:gap-10 transition-all duration-500">
      
      {/* HEADER SECTION */}
      <header className="flex flex-col md:flex-row justify-between items-end md:items-start gap-4 pb-8 border-b-2 border-black">
        <div className="brand-container w-full md:w-auto flex flex-col">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 md:w-20 md:h-20 bg-black flex items-center justify-center rounded-lg border-2 border-black shadow-[4px_4px_0_#d1e8e2] transform -rotate-3">
              <ZapIcon className="text-white w-6 h-6 md:w-10 md:h-10" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-5xl md:text-7xl lg:text-8xl xl:text-9xl font-black leading-[0.85] mb-0 tracking-tighter">
                Zentime
              </h1>
              <span className="text-xl md:text-2xl font-bold italic opacity-80 mt-1 ml-1">
                by yeatz
              </span>
            </div>
          </div>
          <nav className="flex gap-6 uppercase text-[10px] md:text-xs font-bold mt-6 tracking-widest overflow-x-auto pb-2 scrollbar-hide">
            {['home', 'profile', 'tasks', 'notes', 'work', 'blog'].map(item => (
              <button key={item} onClick={() => scrollToSection(item)} className="cursor-pointer hover:underline transition-all hover:text-indigo-600 whitespace-nowrap">
                {item}
              </button>
            ))}
            <button
              onClick={() => setShowSettings(true)}
              className="cursor-pointer hover:underline transition-all hover:text-indigo-600 whitespace-nowrap flex items-center gap-1"
            >
              <Wand2Icon size={12} /> SETTINGS
            </button>
          </nav>
        </div>
        <div className="flex flex-col items-end gap-2 w-full md:w-auto">
          <div className="retro-card p-4 flex items-center gap-4 bg-[#fdfdfd] w-full md:w-auto justify-between md:justify-start">
             <div className="text-right">
                <div className="text-2xl font-bold mono leading-none">{currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                <div className="text-[10px] font-bold uppercase text-slate-400 tracking-tighter mt-1">Live Feed</div>
             </div>
             <div className="w-12 h-12 rounded-full border-2 border-black flex items-center justify-center bg-white shadow-[2px_2px_0_#000]">
                <ClockIcon size={24} />
             </div>
          </div>
        </div>
      </header>

      {/* PROFILE SECTION */}
      <section id="profile" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="retro-card p-6 bg-white flex flex-col items-center md:items-start text-center md:text-left">
          <div className="w-24 h-24 bg-black border-4 border-white shadow-[4px_4px_0_#000] flex items-center justify-center mb-4 relative overflow-hidden">
            <UserIcon className="text-white w-12 h-12" />
          </div>
          <div className="w-full">
            {isEditingProfile ? (
              <div className="space-y-3">
                <input 
                  type="text" 
                  value={profile.name} 
                  onChange={(e) => setProfile({...profile, name: e.target.value})}
                  className="retro-input w-full font-bold uppercase tracking-tight"
                />
                <textarea 
                  value={profile.mantra} 
                  onChange={(e) => setProfile({...profile, mantra: e.target.value})}
                  className="retro-input w-full text-xs h-16 resize-none"
                />
                <button onClick={() => setIsEditingProfile(false)} className="retro-btn bg-black text-white w-full flex items-center justify-center gap-2">
                  <SaveIcon size={14} /> SAVE
                </button>
              </div>
            ) : (
              <div className="relative group">
                <h2 className="text-3xl font-black uppercase tracking-tighter mb-1 truncate">{profile.name}</h2>
                <p className="text-xs font-medium italic opacity-60 mb-4">{profile.mantra}</p>
                <button 
                  onClick={() => setIsEditingProfile(true)}
                  className="absolute -top-2 -right-2 p-1.5 bg-white border-2 border-black shadow-[2px_2px_0_#000] hover:scale-110 transition-transform"
                >
                  <Edit3Icon size={14} />
                </button>
              </div>
            )}
            <div className="mt-4 pt-4 border-t-2 border-dashed border-black/10">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Efficiency Member since</span>
              <p className="text-xs font-bold mono">{new Date(profile.joinedDate).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 retro-card p-6 bg-[#d1e8e2] flex flex-col justify-center">
           <h3 className="text-2xl font-black lowercase mb-2">productivity status</h3>
           <p className="text-sm opacity-80 mb-6">You've completed <span className="font-black underline">{tasks.filter(t => t.completed).length} tasks</span> this week. Your AI Focus score is optimal.</p>
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Object.values(TaskCategory).map(cat => (
                <div key={cat} className="bg-white/60 border-2 border-black p-3 text-center">
                   <div className="text-lg font-black">{tasks.filter(t => t.category === cat).length}</div>
                   <div className="text-[9px] font-bold uppercase tracking-tighter opacity-50">{cat}</div>
                </div>
              ))}
           </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-10">
        
        {/* TASK LIST */}
        <div id="tasks" className="xl:col-span-8 space-y-8 order-2 xl:order-1">
          <section className="flex flex-col md:flex-row items-center md:items-start gap-6 bg-white/40 p-6 rounded-2xl border-2 border-black/5">
            <div className="mint-box w-32 h-32 md:w-40 md:h-40 flex-shrink-0 flex items-center justify-center relative shadow-[6px_6px_0_#000]">
              <span className="absolute -left-3 top-3 bg-white px-2 border-2 border-black font-bold uppercase text-[10px] tracking-tighter">AI AGENT</span>
              <h2 className="text-3xl font-black rotate-[-4deg]">tasks</h2>
              <div className="absolute -bottom-3 right-3 bg-white p-2 border-2 border-black">
                <LayoutIcon size={20} />
              </div>
            </div>
            <div className="flex-1 text-center md:text-left pt-2">
              <p className="text-sm md:text-base leading-relaxed mb-4 opacity-80">
                Organize your life across Private, Education, and Entertainment. Let Gemini evaluate durations for quality flow.
              </p>
              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                <button 
                  onClick={() => addTask("New Goal", TaskCategory.PRIVATE, 30)}
                  className="retro-btn bg-white hover:bg-slate-50 flex items-center gap-2 px-4 py-2"
                >
                  <PlusIcon size={16} /> <span className="text-xs">Add Manual</span>
                </button>
                <button 
                  onClick={() => handleAiCommand("Optimize my current schedule for the best productivity flow today.")}
                  className="retro-btn bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2 shadow-[4px_4px_0_#000] px-4 py-2"
                >
                  <SparklesIcon size={16} /> <span className="text-xs">AI Planner</span>
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-black pb-4">
                <h2 className="text-3xl font-black lowercase">my timeline</h2>
                
                <div className="relative flex items-center w-full sm:w-auto">
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tasks..."
                    className="retro-input py-2 pl-10 pr-4 text-xs font-bold w-full sm:w-64 placeholder:opacity-40 rounded-none"
                  />
                  <SearchIcon size={16} className="absolute left-3 text-black opacity-60" />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 p-1"><XIcon size={14} /></button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredTasks.length === 0 ? (
                  <div className="col-span-full py-20 text-center opacity-30 italic text-lg">Empty timeline. Add tasks above.</div>
                ) : (
                  filteredTasks.map(task => (
                    <div 
                      key={task.id} 
                      className={`retro-card p-4 flex flex-col gap-3 relative overflow-hidden transition-all duration-300 transform ${
                        task.completed ? 'opacity-40 grayscale scale-[0.98]' : 'hover:-translate-y-1 hover:shadow-[8px_8px_0_#000]'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className={`text-[10px] font-black uppercase px-2 py-1 bg-slate-100 border-2 border-black ${task.completed ? 'bg-slate-200 border-slate-300' : ''}`}>
                          {task.category}
                        </span>
                        <div className="flex gap-2 items-center">
                          <button 
                            onClick={() => handleAiCommand(`Update the duration and give me a specific plan for: "${task.title}"`)}
                            className="text-indigo-600 hover:scale-125 transition-transform p-1"
                          >
                            <SparklesIcon size={18} />
                          </button>
                          <button 
                            onClick={() => toggleTask(task.id)} 
                            className={`transition-all duration-200 p-1 ${task.completed ? 'text-indigo-600' : 'text-slate-300 hover:text-indigo-400'}`}
                          >
                            <CheckCircleIcon size={24} fill={task.completed ? 'currentColor' : 'none'} />
                          </button>
                          <button onClick={() => deleteTask(task.id)} className="text-slate-300 hover:text-red-600 transition-colors p-1">
                            <TrashIcon size={18} />
                          </button>
                        </div>
                      </div>
                      
                      <h3 className={`text-lg font-black truncate relative ${task.completed ? 'text-slate-400' : 'text-slate-800'}`}>
                        {task.title}
                        <div className={`absolute left-0 top-1/2 h-[2px] bg-slate-400 transition-all duration-500 ease-out ${
                          task.completed ? 'w-full opacity-100' : 'w-0 opacity-0'
                        }`} />
                      </h3>

                      {task.notes && (
                        <div className={`bg-amber-50/50 border-2 border-black p-2 text-[11px] font-bold flex gap-2 ${task.completed ? 'opacity-50' : ''}`}>
                          <StickyNoteIcon size={14} className="flex-shrink-0 text-amber-600 mt-0.5" />
                          <span className="line-clamp-2">{task.notes}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/10">
                        <div className="flex items-center gap-2 text-[11px] font-bold opacity-60 mono">
                          <ClockIcon size={12} /> {task.estimatedDuration}m
                        </div>
                        {task.reminderTime && (
                          <div className={`flex items-center gap-2 text-[11px] font-bold mono ${
                            task.alarmEnabled && !task.completed ? 'text-red-500 animate-pulse' : 'text-slate-400'
                          }`}>
                            <BellIcon size={12} /> {task.reminderTime}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* GENERAL NOTES SECTION */}
            <div id="notes" className="space-y-6 pt-10 border-t-4 border-black border-dashed">
               <div className="flex items-center justify-between">
                 <h2 className="text-3xl font-black lowercase">brain dump</h2>
                 <button onClick={addGeneralNote} className="retro-btn bg-white flex items-center gap-2">
                   <PlusIcon size={16} /> <span className="text-xs">Add Note</span>
                 </button>
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {generalNotes.length === 0 ? (
                    <div className="col-span-full py-10 text-center opacity-30 italic">No notes yet. Clear your mind here.</div>
                 ) : (
                    generalNotes.map(note => (
                      <div key={note.id} className="retro-card p-4 flex flex-col gap-3 min-h-[150px]" style={{ backgroundColor: note.color || '#fff' }}>
                         <div className="flex justify-between items-center border-b-2 border-black/10 pb-2">
                            <span className="text-[10px] font-bold mono opacity-40">{new Date(note.createdAt).toLocaleDateString()}</span>
                            <button onClick={() => deleteGeneralNote(note.id)} className="text-black/40 hover:text-red-600">
                               <XIcon size={14} />
                            </button>
                         </div>
                         <textarea 
                           className="flex-1 bg-transparent outline-none text-xs font-bold leading-relaxed resize-none"
                           value={note.content}
                           onChange={(e) => updateGeneralNote(note.id, e.target.value)}
                         />
                      </div>
                    ))
                 )}
               </div>
            </div>
          </section>
        </div>

        {/* AI CONTROL & STATS */}
        <div id="work" className="xl:col-span-4 space-y-8 order-1 xl:order-2">
          
          <div className="retro-card flex flex-col h-[400px] md:h-[500px] lg:h-[600px] bg-[#222] text-white overflow-hidden relative shadow-[8px_8px_0_#000]">
            <div className="bg-white text-black px-4 py-3 border-b-2 border-black flex items-center justify-between">
              <div className="flex items-center gap-2 font-black text-xs tracking-tight">
                <TerminalIcon size={16} /> COMMAND_AI_V2.5
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className={`w-3 h-3 rounded-full ${i === 1 ? 'bg-red-400' : i === 2 ? 'bg-yellow-400' : 'bg-green-400'} border border-black/20`}></div>
                ))}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs md:text-sm">
              <div className="text-green-400 opacity-60">&gt; Session active for {profile.name}</div>
              <div className="text-green-400 opacity-60">&gt; Neural bridge stable...</div>
              <div className="text-slate-400 border border-slate-700 p-3 italic rounded-lg bg-slate-800/30 text-[11px]">
                "I have an exam study session for 2 hours, help me schedule it."
              </div>
              {chatHistory.map((chat, i) => (
                <div key={i} className={`${chat.role === 'user' ? 'text-blue-300' : 'text-slate-100'} leading-relaxed animate-in fade-in slide-in-from-bottom-2`}>
                  <span className="font-black opacity-30">[{chat.role === 'user' ? 'YOU' : 'AI'}]</span> {chat.text}
                </div>
              ))}
              {isAiLoading && <div className="animate-pulse text-indigo-400 font-black italic">Gemini is thinking...</div>}
              <div ref={chatEndRef} />
            </div>

            <div className="relative">
              {showSuggestions && (
                <div className="absolute bottom-full left-0 right-0 bg-white border-x-2 border-t-2 border-black text-black z-20">
                  {SLASH_COMMANDS.map((cmd, idx) => (
                    <div 
                      key={cmd.cmd}
                      onMouseEnter={() => setSuggestionIndex(idx)}
                      onClick={() => selectSuggestion(idx)}
                      className={`px-4 py-3 cursor-pointer flex items-center justify-between border-b-2 border-black/5 ${suggestionIndex === idx ? 'bg-indigo-50 border-l-8 border-indigo-600' : ''}`}
                    >
                      <span className="font-black font-mono text-sm">{cmd.cmd}</span>
                      <span className="text-[10px] font-bold opacity-60">{cmd.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); handleAiCommand(); }} className="p-3 border-t-2 border-black bg-white flex gap-3 relative">
                <input 
                  ref={inputRef}
                  type="text" 
                  value={userInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Gemini to manage your day..."
                  className="flex-1 outline-none text-black font-black text-sm p-2 px-3 placeholder:opacity-20"
                />
                <button type="submit" className="text-black hover:scale-125 transition-transform p-2 bg-slate-50 border-2 border-black shadow-[2px_2px_0_#000]">
                  <HashIcon size={20} />
                </button>
              </form>
            </div>
          </div>

          <div className="retro-card p-6 bg-[#fdfdfd]">
            <h2 className="text-2xl font-black mb-6 lowercase border-b-2 border-black/10 pb-2">focus balance</h2>
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <div className="h-40 w-40 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryStats}
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="#1a1a1a"
                      strokeWidth={2}
                    >
                      {categoryStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-4 w-full">
                <div className="text-center p-4 border-2 border-black bg-white shadow-[3px_3px_0_#000]">
                  <div className="text-3xl font-black mono leading-none">{tasks.length}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mt-1">Total</div>
                </div>
                <div className="text-center p-4 border-2 border-black bg-indigo-50/40 shadow-[3px_3px_0_#000]">
                  <div className="text-3xl font-black mono leading-none">{tasks.filter(t => t.completed).length}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mt-1">Done</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="mt-8 pt-8 border-t-2 border-black grid grid-cols-1 md:grid-cols-3 gap-8 pb-16">
        <div id="blog" className="md:col-span-2">
          <h2 className="text-4xl font-black mb-6 lowercase">session insights</h2>
          <div className="retro-card p-6 space-y-4 bg-white/60">
            <div className="flex flex-col gap-2">
               <label className="text-[11px] font-black uppercase opacity-60 tracking-wider">Productivity Review</label>
               <textarea 
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  className="retro-input h-32 resize-none text-sm font-medium leading-relaxed" 
                  placeholder="Record your productivity wins and AI advice for later review..."
               ></textarea>
            </div>
            <button className="retro-btn bg-black text-white hover:bg-zinc-800 transition-colors px-6 py-2" onClick={() => alert('Observations saved.')}>
              Archive Review
            </button>
          </div>
        </div>
        <div className="flex flex-col justify-end">
           <div className="mint-box p-6 flex items-center gap-4 text-left shadow-[6px_6px_0_#000]">
              <SparklesIcon size={36} className="text-indigo-600 animate-pulse" />
              <div className="flex flex-col">
                <div className="font-black text-xs uppercase tracking-tighter">ZenTime AI Core</div>
                <p className="text-[10px] font-bold opacity-60 mt-1 uppercase">User: {profile.name}</p>
              </div>
           </div>
        </div>
      </footer>

      {/* ALARM OVERLAY */}
      {activeAlarm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl">
          <div className="retro-card p-10 w-full max-w-sm bg-white animate-bounce text-center shadow-[12px_12px_0_#000]">
            <Volume2Icon size={56} className="mx-auto mb-4 text-red-500" />
            <h2 className="text-4xl font-black mb-2 lowercase">alarm!</h2>
            <p className="font-black text-lg mb-8 uppercase tracking-widest text-indigo-600">{activeAlarm.title}</p>
            <button 
              onClick={() => setActiveAlarm(null)}
              className="retro-btn bg-red-600 text-white w-full py-5 text-xl shadow-[6px_6px_0_#000] active:translate-y-0"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* SETTINGS PANEL */}
      {showSettings && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="retro-card p-8 w-full max-w-md bg-white">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black">AI Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-black hover:text-red-600 transition-colors"
              >
                <XIcon size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold mb-2">AI Provider</label>
                <select
                  value={localStorage.getItem('aiProvider') || 'gemini'}
                  onChange={(e) => localStorage.setItem('aiProvider', e.target.value)}
                  className="retro-input w-full p-3 font-bold"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">
                  {localStorage.getItem('aiProvider') === 'openai' ? 'OpenAI API Key' : 'Gemini API Key'}
                </label>
                <input
                  type="password"
                  value={localStorage.getItem('aiApiKey') || ''}
                  onChange={(e) => localStorage.setItem('aiApiKey', e.target.value)}
                  placeholder="Enter your API key"
                  className="retro-input w-full p-3 font-bold"
                />
                <p className="text-xs opacity-60 mt-2">
                  {localStorage.getItem('aiProvider') === 'openai'
                    ? 'Get your key from platform.openai.com/api-keys'
                    : 'Get your key from makersuite.google.com/app/apikey'}
                </p>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => {
                    localStorage.setItem('aiProvider', localStorage.getItem('aiProvider') || 'gemini');
                    localStorage.setItem('aiApiKey', localStorage.getItem('aiApiKey') || '');
                    setShowSettings(false);
                  }}
                  className="retro-btn bg-black text-white w-full py-3"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
