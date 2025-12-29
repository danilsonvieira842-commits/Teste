
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BoardData, Task, Priority, Subtask, User, Comment, PrioritizationResult, DeadlinePredictionResult, NotificationSettings } from './types';
import { analyzeBoardProductivity, breakdownTaskIntoSubtasks, prioritizeBoardWithAI, predictTaskDeadline } from './services/geminiService';
import { translations, Language } from './translations';
import { 
  ResponsiveContainer, PieChart, Pie, Tooltip, AreaChart, Area
} from 'recharts';
import * as XLSX from 'xlsx';

declare const confetti: any;

const MOCK_TEAM: User[] = [
  { id: 'user-1', name: 'Alice Silva', email: 'alice@vieira.com', photoURL: 'https://ui-avatars.com/api/?name=Alice+Silva&background=f3b032&color=fff', role: 'admin', lang: 'pt', points: 1200, notifications: { slackEnabled: false, whatsappEnabled: false, notifyOnHighPriority: true, notifyOnMentions: true } },
  { id: 'user-2', name: 'Bruno Costa', email: 'bruno@vieira.com', photoURL: 'https://ui-avatars.com/api/?name=Bruno+Costa&background=4f46e5&color=fff', role: 'editor', lang: 'pt', points: 850, notifications: { slackEnabled: false, whatsappEnabled: false, notifyOnHighPriority: true, notifyOnMentions: true } },
  { id: 'user-3', name: 'Carla Rocha', email: 'carla@vieira.com', photoURL: 'https://ui-avatars.com/api/?name=Carla+Rocha&background=10b981&color=fff', role: 'editor', lang: 'pt', points: 940, notifications: { slackEnabled: false, whatsappEnabled: false, notifyOnHighPriority: true, notifyOnMentions: true } },
];

const DEFAULT_BOARD = (title: string): BoardData => ({
  id: Math.random().toString(36).substr(2, 9),
  title: title,
  tasks: {},
  columns: {
    'col-1': { id: 'col-1', title: 'A Fazer', taskIds: [] },
    'col-2': { id: 'col-2', title: 'Em Andamento', taskIds: [] },
    'col-3': { id: 'col-3', title: 'Concluído', taskIds: [] },
  },
  columnOrder: ['col-1', 'col-2', 'col-3'],
  userStats: { points: 0, level: 1, badges: [] }
});

const BrandLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const sizes = {
    sm: { icon: "w-6 h-6", text: "text-lg" },
    md: { icon: "w-8 h-8", text: "text-xl" },
    lg: { icon: "w-14 h-14", text: "text-3xl" }
  };
  const { icon, text } = sizes[size];
  return (
    <div className="flex items-center gap-2 select-none">
      <div className={`${icon} bg-gradient-to-br from-[#f3b032] to-[#b47e12] rounded-xl flex items-center justify-center shadow-lg shadow-[#f3b032]/20`}>
        <i className="fas fa-bolt text-white text-[60%]"></i>
      </div>
      <div className={`font-black uppercase tracking-tighter leading-none ${text}`}>
        <span className="block text-white">Vieira</span>
        <span className="block text-[#f3b032]">Boards</span>
      </div>
    </div>
  );
};

const Toggle = ({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{label}</span>
    <button 
      onClick={onClick}
      className={`w-12 h-6 rounded-full transition-all relative ${active ? 'bg-[#f3b032]' : 'bg-white/10'}`}
    >
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-all ${active ? 'left-7' : 'left-1'}`} />
    </button>
  </div>
);

const App: React.FC = () => {
  // --- Estados ---
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('vieira_session_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [boards, setBoards] = useState<BoardData[]>(() => {
    const saved = localStorage.getItem('vieira_all_boards');
    if (saved) return JSON.parse(saved);
    const initial = DEFAULT_BOARD("Work Estratégico");
    initial.tasks = {
      'task-1': { id: 'task-1', title: 'Explorar IA Vieira', description: 'Abra esta tarefa para ver o poder do Gemini.', priority: Priority.HIGH, tags: ['startup'], createdAt: Date.now(), subtasks: [{id: 's1', title: 'Testar Smart Breakdown', completed: false}], comments: [], attachments: [], icon: 'fa-sparkles', assigneeId: 'user-1' }
    };
    initial.columns['col-1'].taskIds = ['task-1'];
    return [initial];
  });

  const [activeBoardId, setActiveBoardId] = useState<string>(boards[0]?.id || '');
  const [lang, setLang] = useState<Language>(user?.lang || 'pt');
  const [viewMode, setViewMode] = useState<'board' | 'dashboard' | 'projects' | 'profile'>('board');
  const [showPrioritizeModal, setShowPrioritizeModal] = useState(false);
  const [prioritizeCriteria, setPrioritizeCriteria] = useState('');
  const [isPrioritizing, setIsPrioritizing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [insights, setInsights] = useState('Workspace otimizado.');
  const [notification, setNotification] = useState<string | null>(null);
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [isPredictingDeadline, setIsPredictingDeadline] = useState(false);
  const [predictionResult, setPredictionResult] = useState<DeadlinePredictionResult | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const activeBoard = useMemo(() => boards.find(b => b.id === activeBoardId) || boards[0], [boards, activeBoardId]);
  const selectedTask = selectedTaskId ? activeBoard.tasks[selectedTaskId] : null;
  const t = translations[lang];

  // --- Efeitos ---
  useEffect(() => {
    localStorage.setItem('vieira_all_boards', JSON.stringify(boards));
    if (activeBoard) {
      const context = JSON.stringify({
        tasks: Object.keys(activeBoard.tasks).length,
        done: activeBoard.columns['col-3'].taskIds.length
      });
      analyzeBoardProductivity(context, lang).then(setInsights);
    }
  }, [boards, activeBoardId, lang]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('vieira_session_user', JSON.stringify(user));
    }
  }, [user]);

  // --- Handlers ---
  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    const u: User = { id: 'user-main', name: email.split('@')[0].toUpperCase(), email, role: 'admin', lang: 'pt', points: 100, photoURL: `https://ui-avatars.com/api/?name=${email}&background=f3b032&color=000`, notifications: { slackEnabled: false, whatsappEnabled: false, notifyOnHighPriority: true, notifyOnMentions: true } };
    setUser(u);
  };

  const updateActiveBoard = (updates: Partial<BoardData>) => {
    setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, ...updates } : b));
  };

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    const updatedTasks = { ...activeBoard.tasks, [taskId]: { ...activeBoard.tasks[taskId], ...updates } };
    updateActiveBoard({ tasks: updatedTasks });
  };

  const updateUserNotificationSettings = (updates: Partial<NotificationSettings>) => {
    if (!user) return;
    const updatedUser = {
      ...user,
      notifications: { ...user.notifications, ...updates }
    };
    setUser(updatedUser);
    showNotification("Notificações atualizadas");
  };

  const addNewTask = (columnId: string) => {
    const taskId = `task-${Math.random().toString(36).substr(2, 9)}`;
    const newTask: Task = { id: taskId, title: 'Nova Tarefa', description: '', priority: Priority.LOW, tags: [], createdAt: Date.now(), subtasks: [], comments: [], attachments: [], icon: 'fa-plus', assigneeId: user?.id };
    const updatedTasks = { ...activeBoard.tasks, [taskId]: newTask };
    const updatedCols = { ...activeBoard.columns, [columnId]: { ...activeBoard.columns[columnId], taskIds: [taskId, ...activeBoard.columns[columnId].taskIds] } };
    updateActiveBoard({ tasks: updatedTasks, columns: updatedCols });
    setSelectedTaskId(taskId);
  };

  const toggleTaskCompletion = (taskId: string) => {
    const currentColId = Object.keys(activeBoard.columns).find(cid => activeBoard.columns[cid].taskIds.includes(taskId));
    if (!currentColId) return;
    const isDone = currentColId === 'col-3';
    const targetColId = isDone ? 'col-1' : 'col-3';

    const sourceIds = activeBoard.columns[currentColId].taskIds.filter(id => id !== taskId);
    const targetIds = [taskId, ...activeBoard.columns[targetColId].taskIds];

    updateActiveBoard({
      columns: {
        ...activeBoard.columns,
        [currentColId]: { ...activeBoard.columns[currentColId], taskIds: sourceIds },
        [targetColId]: { ...activeBoard.columns[targetColId], taskIds: targetIds }
      }
    });

    if (!isDone && typeof confetti !== 'undefined') {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 }, colors: ['#f3b032', '#ffffff'] });
    }
    showNotification(isDone ? "Tarefa Reaberta" : "Tarefa Concluída!");
  };

  const handleSmartBreakdown = async () => {
    if (!selectedTaskId || !selectedTask) return;
    setIsBreakingDown(true);
    showNotification("IA quebrando tarefa...");
    try {
      const steps = await breakdownTaskIntoSubtasks(selectedTask.title, selectedTask.description, lang);
      const subs: Subtask[] = steps.map(s => ({ id: Math.random().toString(36).substr(2, 5), title: s, completed: false }));
      updateTask(selectedTaskId, { subtasks: [...selectedTask.subtasks, ...subs] });
    } catch (e) { showNotification("Erro IA"); } finally { setIsBreakingDown(false); }
  };

  const handlePredictDeadline = async () => {
    if (!selectedTaskId || !selectedTask) return;
    setIsPredictingDeadline(true);
    try {
      const res = await predictTaskDeadline(selectedTask, activeBoard, lang);
      setPredictionResult(res);
    } catch (e) { showNotification("Erro Previsão"); } finally { setIsPredictingDeadline(false); }
  };

  const handleSmartPrioritize = async () => {
    if (!prioritizeCriteria.trim()) return;
    setIsPrioritizing(true);
    setShowPrioritizeModal(false);
    try {
      const result: PrioritizationResult = await prioritizeBoardWithAI(activeBoard, prioritizeCriteria, lang);
      const updatedTasks = { ...activeBoard.tasks };
      Object.entries(result.priorityChanges).forEach(([tid, p]) => { if (updatedTasks[tid]) updatedTasks[tid].priority = p as Priority; });
      updateActiveBoard({
        tasks: updatedTasks,
        columns: { ...activeBoard.columns, ...Object.fromEntries(Object.entries(result.columnOrders).map(([cid, ids]) => [cid, { ...activeBoard.columns[cid], taskIds: ids }])) }
      });
      setInsights(result.insight);
      showNotification("Quadro Otimizado!");
    } catch (e) { showNotification("Erro IA"); } finally { setIsPrioritizing(false); }
  };

  const exportExcel = () => {
    const data = Object.values(activeBoard.tasks).map((t: Task) => ({
      Título: t.title,
      Prioridade: t.priority,
      Status: activeBoard.columns['col-3'].taskIds.includes(t.id) ? 'Concluído' : 'Ativo'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Status");
    XLSX.writeFile(wb, `${activeBoard.title}.xlsx`);
  };

  // --- UI Parts ---
  if (!user) return (
    <main className="h-screen bg-[#050505] flex items-center justify-center p-6 pb-safe pt-safe">
      <div className="w-full max-w-sm bg-[#0e0e0e] p-8 rounded-[2.5rem] border border-white/5 text-center animate-modal shadow-2xl">
        <BrandLogo size="lg" />
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-8">Project Intelligence</p>
        <form onSubmit={handleAuth} className="mt-10 space-y-4 text-left">
          <input type="email" placeholder="E-mail corporativo" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white outline-none focus:border-[#f3b032] transition-all" />
          <input type="password" placeholder="Senha mestre" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white outline-none focus:border-[#f3b032] transition-all" />
          <button className="w-full bg-gradient-to-r from-[#f3b032] to-[#d49924] text-black font-black py-5 rounded-2xl uppercase text-[11px] tracking-[0.2em] shadow-lg active:scale-95 transition-all mt-4">Entrar</button>
        </form>
      </div>
    </main>
  );

  return (
    <div className="h-screen bg-[#050505] flex flex-col overflow-hidden pb-safe pt-safe">
      {/* Header Compacto */}
      <header className="shrink-0 h-16 glass border-b border-white/5 flex items-center justify-between px-6 z-40">
        <BrandLogo size="sm" />
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPrioritizeModal(true)} className="w-10 h-10 rounded-xl bg-[#f3b032]/10 border border-[#f3b032]/20 text-[#f3b032] flex items-center justify-center"><i className="fas fa-wand-magic-sparkles text-xs"></i></button>
          <img src={user.photoURL} className="w-9 h-9 rounded-xl border border-white/20" alt="" />
        </div>
      </header>

      {/* Área de Conteúdo Principal */}
      <main className="flex-1 overflow-hidden relative">
        {viewMode === 'board' && (
          <div className="h-full flex flex-col">
            {/* Search Bar Mobile */}
            <div className="px-6 py-4 bg-[#0a0a0a]/50">
               <div className="relative">
                 <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
                 <input type="text" placeholder="Buscar tarefas..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white outline-none focus:border-[#f3b032]/40 transition-all" />
               </div>
            </div>

            {/* Kanban Horizontal Snap Scroll */}
            <div className="flex-1 overflow-x-auto snap-x snap-mandatory flex gap-4 p-6 custom-scrollbar">
              {activeBoard.columnOrder.map(colId => {
                const column = activeBoard.columns[colId];
                const taskIds = column.taskIds.filter(tid => activeBoard.tasks[tid].title.toLowerCase().includes(searchQuery.toLowerCase()));
                return (
                  <section key={colId} className="w-[85vw] md:w-[320px] shrink-0 snap-center flex flex-col bg-[#0a0a0a] border border-white/5 rounded-[2rem] overflow-hidden shadow-xl">
                    <div className="p-5 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
                       <div className="flex items-center gap-3">
                         <span className={`w-2 h-2 rounded-full ${colId === 'col-3' ? 'bg-[#10b981]' : colId === 'col-2' ? 'bg-[#f3b032]' : 'bg-slate-500'}`}></span>
                         <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-300">{column.title}</h2>
                       </div>
                       <button onClick={() => addNewTask(colId)} className="w-8 h-8 rounded-lg bg-white/5 text-slate-400 flex items-center justify-center"><i className="fas fa-plus text-xs"></i></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                       {taskIds.map(tid => {
                         const task = activeBoard.tasks[tid];
                         return (
                           <div key={tid} onClick={() => setSelectedTaskId(tid)} className="bg-[#111] p-5 rounded-2xl border border-white/5 active:scale-95 transition-all shadow-lg active:bg-[#161616]">
                             <div className="flex justify-between items-start mb-3">
                               <h3 className={`text-sm font-bold ${colId === 'col-3' ? 'text-slate-500 line-through' : 'text-white'}`}>{task.title}</h3>
                               <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${task.priority === Priority.HIGH ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-white/5 text-slate-500 border-white/10'}`}>{task.priority}</span>
                             </div>
                             {task.subtasks.length > 0 && (
                               <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-2">
                                 <div className="h-full bg-[#f3b032]" style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }}></div>
                               </div>
                             )}
                           </div>
                         );
                       })}
                    </div>
                  </section>
                );
              })}
              <div className="w-6 shrink-0 md:hidden"></div> {/* Padding final */}
            </div>
          </div>
        )}

        {viewMode === 'dashboard' && (
          <div className="h-full overflow-y-auto p-8 space-y-8 animate-modal pb-24">
             <h2 className="text-2xl font-black uppercase italic tracking-tighter">Performance</h2>
             <div className="bg-[#0e0e0e] p-8 rounded-[2rem] border border-white/5">
                <h3 className="text-[10px] font-black uppercase text-slate-500 mb-6 tracking-widest">Distribuição</h3>
                <div className="h-64">
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                       <Pie data={[{n:'Done',v:activeBoard.columns['col-3'].taskIds.length,f:'#10b981'},{n:'Rest',v:activeBoard.columns['col-1'].taskIds.length+activeBoard.columns['col-2'].taskIds.length,f:'#333'}]} dataKey="v" innerRadius={60} outerRadius={80} stroke="none" fill="#f3b032" />
                       <Tooltip contentStyle={{background:'#111', border:'none', borderRadius:'12px'}} />
                     </PieChart>
                   </ResponsiveContainer>
                </div>
             </div>
             <div className="bg-[#0e0e0e] p-8 rounded-[2rem] border border-white/5">
                <h3 className="text-[10px] font-black uppercase text-slate-500 mb-6 tracking-widest">Atividade Semanal</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[{n:'S',v:10},{n:'T',v:25},{n:'Q',v:18},{n:'Q',v:42},{n:'S',v:35}]}>
                      <Area type="monotone" dataKey="v" stroke="#f3b032" strokeWidth={3} fill="#f3b03222" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
             </div>
          </div>
        )}

        {viewMode === 'profile' && (
          <div className="h-full overflow-y-auto p-8 animate-modal pb-24">
             <div className="flex flex-col items-center mb-10">
               <img src={user.photoURL} className="w-24 h-24 rounded-[2rem] border-4 border-[#f3b032] shadow-2xl mb-6" alt="" />
               <h2 className="text-2xl font-black italic mb-1">{user.name}</h2>
               <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">{user.email}</p>
             </div>

             <div className="max-w-md mx-auto space-y-8">
               {/* Notificações Section */}
               <section className="bg-[#0e0e0e] p-6 rounded-[2rem] border border-white/5 space-y-6">
                 <div className="flex items-center gap-3 mb-4">
                   <i className="fas fa-bell text-[#f3b032]"></i>
                   <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Configurações de Notificação</h3>
                 </div>
                 
                 <div className="space-y-4">
                    <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                      <Toggle 
                        active={user.notifications.slackEnabled} 
                        onClick={() => updateUserNotificationSettings({ slackEnabled: !user.notifications.slackEnabled })} 
                        label="Slack Integration" 
                      />
                      {user.notifications.slackEnabled && (
                        <div className="mt-3 animate-modal">
                          <label className="text-[9px] font-black uppercase text-slate-500 mb-2 block">Webhook URL</label>
                          <input 
                            type="text" 
                            placeholder="https://hooks.slack.com/services/..."
                            value={user.notifications.slackWebhookUrl || ''} 
                            onChange={e => updateUserNotificationSettings({ slackWebhookUrl: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-white outline-none focus:border-[#f3b032]/40 transition-all"
                          />
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                      <Toggle 
                        active={user.notifications.whatsappEnabled} 
                        onClick={() => updateUserNotificationSettings({ whatsappEnabled: !user.notifications.whatsappEnabled })} 
                        label="WhatsApp Alertas" 
                      />
                      {user.notifications.whatsappEnabled && (
                        <div className="mt-3 animate-modal">
                          <label className="text-[9px] font-black uppercase text-slate-500 mb-2 block">Número (Internacional)</label>
                          <input 
                            type="text" 
                            placeholder="+55 11 99999-9999"
                            value={user.notifications.whatsappNumber || ''} 
                            onChange={e => updateUserNotificationSettings({ whatsappNumber: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-white outline-none focus:border-[#f3b032]/40 transition-all"
                          />
                        </div>
                      )}
                    </div>

                    <div className="pt-2 px-1 space-y-2">
                       <Toggle 
                        active={user.notifications.notifyOnHighPriority} 
                        onClick={() => updateUserNotificationSettings({ notifyOnHighPriority: !user.notifications.notifyOnHighPriority })} 
                        label="Prioridade Crítica" 
                      />
                       <Toggle 
                        active={user.notifications.notifyOnMentions} 
                        onClick={() => updateUserNotificationSettings({ notifyOnMentions: !user.notifications.notifyOnMentions })} 
                        label="Menções e Comentários" 
                      />
                    </div>
                 </div>
               </section>

               {/* Ações Gerais */}
               <div className="space-y-4">
                 <button onClick={exportExcel} className="w-full py-4 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10 flex items-center justify-center gap-3"><i className="fas fa-file-excel"></i> Exportar Dados</button>
                 <button onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')} className="w-full py-4 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10 flex items-center justify-center gap-3"><i className="fas fa-globe"></i> {lang === 'pt' ? 'Português' : 'English'}</button>
                 <button onClick={() => setUser(null)} className="w-full py-4 bg-red-500/10 text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-500/20">Sair da Conta</button>
               </div>
             </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation Ergonômica */}
      <nav className="shrink-0 h-20 glass border-t border-white/5 flex items-center justify-around px-4 pb-safe">
        <button onClick={() => setViewMode('board')} className={`flex flex-col items-center gap-1 transition-all ${viewMode === 'board' ? 'text-[#f3b032]' : 'text-slate-500'}`}>
          <i className="fas fa-th-large text-lg"></i>
          <span className="text-[9px] font-black uppercase">Quadro</span>
        </button>
        <button onClick={() => setViewMode('dashboard')} className={`flex flex-col items-center gap-1 transition-all ${viewMode === 'dashboard' ? 'text-[#f3b032]' : 'text-slate-500'}`}>
          <i className="fas fa-chart-line text-lg"></i>
          <span className="text-[9px] font-black uppercase">Painel</span>
        </button>
        <button onClick={() => addNewTask('col-1')} className="w-14 h-14 bg-gradient-to-br from-[#f3b032] to-[#d49924] rounded-2xl flex items-center justify-center text-black shadow-lg shadow-[#f3b032]/20 -mt-8 border-4 border-[#050505]">
          <i className="fas fa-plus text-xl"></i>
        </button>
        <button onClick={() => setViewMode('projects')} className={`flex flex-col items-center gap-1 transition-all ${viewMode === 'projects' ? 'text-[#f3b032]' : 'text-slate-500'}`}>
          <i className="fas fa-folder text-lg"></i>
          <span className="text-[9px] font-black uppercase">Projetos</span>
        </button>
        <button onClick={() => setViewMode('profile')} className={`flex flex-col items-center gap-1 transition-all ${viewMode === 'profile' ? 'text-[#f3b032]' : 'text-slate-500'}`}>
          <i className="fas fa-user text-lg"></i>
          <span className="text-[9px] font-black uppercase">Perfil</span>
        </button>
      </nav>

      {/* Detalhes da Tarefa (Mobile Bottom Sheet / Desktop Sidebar) */}
      {selectedTaskId && selectedTask && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center md:justify-center p-0 md:p-10">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedTaskId(null)} />
           <div className="relative w-full max-h-[90vh] md:max-w-xl md:max-h-[80vh] bg-[#0d0d0d] rounded-t-[2.5rem] md:rounded-[2.5rem] border-t md:border border-white/10 flex flex-col shadow-2xl animate-modal overflow-hidden">
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mt-4 md:hidden" />
              <div className="p-8 flex items-center justify-between border-b border-white/5">
                <h2 className="text-xl font-black uppercase italic tracking-tighter">Tarefa</h2>
                <button onClick={() => setSelectedTaskId(null)} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"><i className="fas fa-times text-xs"></i></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Título</label>
                    <input type="text" value={selectedTask.title} onChange={e => updateTask(selectedTaskId, { title: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-[#f3b032]/50" />
                 </div>
                 
                 <div className="flex gap-4">
                   <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Nível</label>
                      <select value={selectedTask.priority} onChange={e => updateTask(selectedTaskId, { priority: e.target.value as Priority })} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs font-black text-white outline-none appearance-none">
                        <option value={Priority.LOW}>BAIXA</option>
                        <option value={Priority.MEDIUM}>MÉDIA</option>
                        <option value={Priority.HIGH}>ALTA</option>
                      </select>
                   </div>
                   <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Prazo</label>
                      <button onClick={handlePredictDeadline} className="text-[9px] font-black text-[#f3b032] uppercase ml-2">Prever com IA</button>
                      <input type="date" value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().split('T')[0] : ''} onChange={e => updateTask(selectedTaskId, { dueDate: e.target.value ? new Date(e.target.value).getTime() : undefined })} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white outline-none" />
                   </div>
                 </div>

                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Subtarefas</label>
                       <button onClick={handleSmartBreakdown} disabled={isBreakingDown} className="text-[9px] font-black text-[#f3b032] uppercase bg-[#f3b032]/10 px-3 py-1.5 rounded-lg border border-[#f3b032]/20">
                         {isBreakingDown ? <i className="fas fa-circle-notch fa-spin mr-1"></i> : <i className="fas fa-sparkles mr-1"></i>} IA Breakdown
                       </button>
                    </div>
                    <div className="space-y-2">
                       {selectedTask.subtasks.map(s => (
                         <div key={s.id} onClick={() => {
                           const next = selectedTask.subtasks.map(item => item.id === s.id ? { ...item, completed: !item.completed } : item);
                           updateTask(selectedTaskId, { subtasks: next });
                         }} className="flex items-center gap-3 p-4 bg-white/[0.03] border border-white/5 rounded-xl active:bg-white/[0.08]">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${s.completed ? 'bg-[#10b981] border-[#10b981]' : 'border-white/20'}`}>
                               {s.completed && <i className="fas fa-check text-[10px] text-black"></i>}
                            </div>
                            <span className={`text-sm ${s.completed ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{s.title}</span>
                         </div>
                       ))}
                       <button onClick={() => updateTask(selectedTaskId, { subtasks: [...selectedTask.subtasks, { id: Math.random().toString(36).substr(2, 5), title: 'Novo item', completed: false }] })} className="w-full py-4 border-2 border-dashed border-white/5 rounded-xl text-[10px] font-black text-slate-500 uppercase">+ Adicionar Passo</button>
                    </div>
                 </div>

                 <button onClick={() => toggleTaskCompletion(selectedTaskId)} className="w-full py-5 bg-[#10b981] text-black rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-[#10b981]/20">Concluir Iniciativa</button>
                 <button onClick={() => { if(confirm("Remover?")) { 
                   const colId = Object.keys(activeBoard.columns).find(cid => activeBoard.columns[cid].taskIds.includes(selectedTaskId));
                   if(colId) {
                     const nextIds = activeBoard.columns[colId].taskIds.filter(id => id !== selectedTaskId);
                     updateActiveBoard({ columns: { ...activeBoard.columns, [colId]: { ...activeBoard.columns[colId], taskIds: nextIds } } });
                     setSelectedTaskId(null);
                   }
                 }}} className="w-full text-red-500/50 text-[10px] font-black uppercase py-4">Excluir Permanente</button>
              </div>
           </div>
        </div>
      )}

      {/* Modal IA Prioritize */}
      {showPrioritizeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowPrioritizeModal(false)} />
           <div className="relative w-full max-w-sm bg-[#0f0f0f] border border-white/10 rounded-[2.5rem] p-10 shadow-2xl animate-modal text-center">
              <i className="fas fa-wand-magic-sparkles text-3xl text-[#f3b032] mb-6"></i>
              <h2 className="text-xl font-black italic mb-2">IA Vieira Strat</h2>
              <p className="text-slate-500 text-xs mb-8">Defina o critério para reorganizar este quadro.</p>
              <textarea value={prioritizeCriteria} onChange={e => setPrioritizeCriteria(e.target.value)} placeholder="Ex: Focar em prazos curtos..." className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-4 text-xs text-white outline-none mb-6 resize-none" />
              <button onClick={handleSmartPrioritize} disabled={isPrioritizing} className="w-full bg-[#f3b032] text-black font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest active:scale-95 transition-all">
                {isPrioritizing ? 'IA Trabalhando...' : 'Otimizar Agora'}
              </button>
           </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-[#f3b032] text-black px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl z-[500] animate-modal border-2 border-black/10">
          <i className="fas fa-bell mr-2"></i> {notification}
        </div>
      )}

      {/* IA Insight Floating Badge */}
      <div className="fixed bottom-24 left-6 right-6 h-10 glass rounded-full border border-white/10 px-4 flex items-center justify-center gap-3 z-30 pointer-events-none shadow-xl">
         <div className="w-2 h-2 rounded-full bg-[#f3b032] animate-pulse"></div>
         <span className="text-[10px] font-black italic text-slate-300 truncate">{insights}</span>
      </div>
    </div>
  );
};

export default App;
