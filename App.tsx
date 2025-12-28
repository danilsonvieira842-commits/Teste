
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { BoardData, Task, Priority, Subtask, User, Column, Comment, NotificationSettings, AISuggestion, PrioritizationResult, DeadlinePredictionResult, Attachment } from './types';
import { analyzeBoardProductivity, breakdownTaskIntoSubtasks, generateTasksFromPrompt, prioritizeBoardWithAI, predictTaskDeadline } from './services/geminiService';
import { triggerTaskUpdateNotification, triggerMentionNotification } from './services/notificationService';
import { translations, Language } from './translations';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, AreaChart, Area, Legend
} from 'recharts';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

declare const confetti: any;

const AVAILABLE_ICONS = [
  'fa-rocket', 'fa-bug', 'fa-code', 'fa-palette', 
  'fa-bullhorn', 'fa-flask', 'fa-shield-halved', 'fa-envelope',
  'fa-mobile-screen', 'fa-database', 'fa-wrench', 'fa-check-double',
  'fa-briefcase', 'fa-lightbulb', 'fa-chart-line', 'fa-cloud'
];

const MOCK_TEAM: User[] = [
  { id: 'user-1', name: 'Alice Silva', email: 'alice@vieira.com', photoURL: 'https://ui-avatars.com/api/?name=Alice+Silva&background=f3b032&color=fff', role: 'admin', lang: 'pt', points: 1200, notifications: { slackEnabled: false, whatsappEnabled: false, notifyOnHighPriority: true, notifyOnMentions: true } },
  { id: 'user-2', name: 'Bruno Costa', email: 'bruno@vieira.com', photoURL: 'https://ui-avatars.com/api/?name=Bruno+Costa&background=4f46e5&color=fff', role: 'editor', lang: 'pt', points: 850, notifications: { slackEnabled: false, whatsappEnabled: false, notifyOnHighPriority: true, notifyOnMentions: true } },
  { id: 'user-3', name: 'Carla Rocha', email: 'carla@vieira.com', photoURL: 'https://ui-avatars.com/api/?name=Carla+Rocha&background=10b981&color=fff', role: 'editor', lang: 'pt', points: 940, notifications: { slackEnabled: false, whatsappEnabled: false, notifyOnHighPriority: true, notifyOnMentions: true } },
];

const getTagColors = (tag: string) => {
  const hash = tag.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  const h = Math.abs(hash % 360);
  return {
    bg: `hsla(${h}, 80%, 12%, 1)`, 
    border: `hsla(${h}, 80%, 45%, 1)`,
    text: '#ffffff' 
  };
};

const getFileIcon = (type: string) => {
  if (type.includes('image')) return 'fa-file-image';
  if (type.includes('pdf')) return 'fa-file-pdf';
  if (type.includes('word') || type.includes('text')) return 'fa-file-lines';
  if (type.includes('excel') || type.includes('spreadsheet')) return 'fa-file-excel';
  if (type.includes('zip') || type.includes('compressed')) return 'fa-file-zipper';
  return 'fa-file';
};

const BrandLogo = ({ size = "md", isDarkMode = true }: { size?: "sm" | "md" | "lg", isDarkMode?: boolean }) => {
  const sizes = {
    sm: { icon: "w-6 h-6", text: "text-lg" },
    md: { icon: "w-8 h-8", text: "text-xl" },
    lg: { icon: "w-16 h-16", text: "text-4xl" }
  };
  const { icon, text } = sizes[size];

  return (
    <div className="flex items-center gap-3 select-none" aria-hidden="true">
      <div className={`${icon} bg-[#f3b032] rounded-lg flex items-center justify-center shadow-lg shadow-[#f3b032]/20 shrink-0`}>
        <svg viewBox="0 0 100 100" className="w-[70%] h-[70%] fill-white">
          <rect x="15" y="20" width="20" height="10" rx="3" />
          <rect x="40" y="20" width="20" height="10" rx="3" />
          <rect x="65" y="20" width="20" height="10" rx="3" />
          <rect x="15" y="38" width="20" height="44" rx="4" />
          <rect x="65" y="38" width="20" height="44" rx="4" />
          <rect x="40" y="48" width="20" height="14" rx="3" />
        </svg>
      </div>
      <div className={`font-black uppercase tracking-tighter leading-[0.85] ${text}`}>
        <span className="block text-white">Vieira</span>
        <span className="block text-[#f3b032]">Boards</span>
      </div>
    </div>
  );
};

const INITIAL_DATA: BoardData = {
  tasks: {
    'task-1': { id: 'task-1', title: 'Interface Otimizada', description: 'Reduzir padding e tamanhos de fonte para maior densidade.', priority: Priority.HIGH, tags: ['ux', 'ui'], createdAt: Date.now(), dueDate: Date.now() + 86400000, subtasks: [{ id: 's1', title: 'Ajustar variáveis CSS', completed: true }, { id: 's2', title: 'Refatorar cards', completed: false }], complexity: 4, comments: [], attachments: [], icon: 'fa-rocket', assigneeId: 'user-1' },
  },
  columns: {
    'col-1': { id: 'col-1', title: 'Backlog', taskIds: ['task-1'] },
    'col-2': { id: 'col-2', title: 'Progresso', taskIds: [] },
    'col-3': { id: 'col-3', title: 'Feito', taskIds: [] },
  },
  columnOrder: ['col-1', 'col-2', 'col-3'],
  userStats: { points: 150, level: 1, badges: [] },
  team: MOCK_TEAM
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  slackEnabled: false,
  slackWebhookUrl: '',
  whatsappEnabled: false,
  whatsappNumber: '',
  notifyOnHighPriority: true,
  notifyOnMentions: true
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('vieira_session_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [data, setData] = useState<BoardData>(() => {
    const saved = localStorage.getItem('vieira_boards_data');
    return saved ? JSON.parse(saved) : INITIAL_DATA;
  });

  const [lang, setLang] = useState<Language>(user?.lang || 'pt');
  const [showDashboard, setShowDashboard] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPrioritizeModal, setShowPrioritizeModal] = useState(false);
  const [prioritizeCriteria, setPrioritizeCriteria] = useState('');
  const [isPrioritizing, setIsPrioritizing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [inlineExpandedTaskIds, setInlineExpandedTaskIds] = useState<Set<string>>(new Set());
  const [insights, setInsights] = useState('Iniciando análise inteligente...');
  const [notification, setNotification] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssigneeId, setFilterAssigneeId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isCreatingVoiceTask, setIsCreatingVoiceTask] = useState(false);
  const [isPredictingDeadline, setIsPredictingDeadline] = useState(false);
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [predictionResult, setPredictionResult] = useState<DeadlinePredictionResult | null>(null);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = translations[lang];

  useEffect(() => {
    localStorage.setItem('vieira_boards_data', JSON.stringify(data));
    const boardContext = JSON.stringify({
      tasks: Object.values(data.tasks).length,
      columns: data.columnOrder.length,
      completed: data.columns['col-3'].taskIds.length
    });
    analyzeBoardProductivity(boardContext, lang).then(setInsights);
  }, [data, lang]);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    const updatedTask = { ...data.tasks[taskId], ...updates };
    setData(prev => ({
      ...prev,
      tasks: { ...prev.tasks, [taskId]: updatedTask }
    }));
    if (user && updates.priority) {
      triggerTaskUpdateNotification(user, updatedTask, `Prioridade alterada para ${updates.priority.toUpperCase()}`);
    }
  };

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    const task = data.tasks[taskId];
    const newSubtasks = task.subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
    updateTask(taskId, { subtasks: newSubtasks });
    
    // Confetti se todas forem concluídas
    if (newSubtasks.every(s => s.completed) && typeof confetti !== 'undefined') {
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 }, colors: ['#f3b032', '#ffffff'] });
    }
  };

  const handleSmartBreakdown = async () => {
    if (!selectedTaskId || !selectedTask) return;
    setIsBreakingDown(true);
    showNotification("IA decompondo tarefa...");
    try {
      const suggestions = await breakdownTaskIntoSubtasks(selectedTask.title, selectedTask.description, lang);
      const newSubtasks: Subtask[] = suggestions.map(title => ({
        id: Math.random().toString(36).substr(2, 9),
        title,
        completed: false
      }));
      updateTask(selectedTaskId, { subtasks: [...selectedTask.subtasks, ...newSubtasks] });
      showNotification("Checklist gerado com sucesso!");
    } catch (err) {
      showNotification("Erro ao decompor tarefa.");
    } finally {
      setIsBreakingDown(false);
    }
  };

  const toggleTaskCompletion = (taskId: string) => {
    const currentColumnId = Object.keys(data.columns).find(cid => data.columns[cid].taskIds.includes(taskId));
    if (!currentColumnId) return;

    const isCurrentlyDone = currentColumnId === 'col-3';
    const targetColumnId = isCurrentlyDone ? 'col-2' : 'col-3';

    setData(prev => {
      const sourceCol = prev.columns[currentColumnId];
      const targetCol = prev.columns[targetColumnId];
      const newSourceTaskIds = sourceCol.taskIds.filter(id => id !== taskId);
      const newTargetTaskIds = [taskId, ...targetCol.taskIds];
      return {
        ...prev,
        columns: {
          ...prev.columns,
          [currentColumnId]: { ...sourceCol, taskIds: newSourceTaskIds },
          [targetColumnId]: { ...targetCol, taskIds: newTargetTaskIds }
        }
      };
    });

    if (!isCurrentlyDone && typeof confetti !== 'undefined') {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 }, colors: ['#10b981', '#ffffff'] });
    }
    showNotification(isCurrentlyDone ? "Tarefa reaberta" : "Tarefa concluída!");
  };

  const handlePredictDeadline = async () => {
    if (!selectedTaskId || !selectedTask) return;
    setIsPredictingDeadline(true);
    setPredictionResult(null);
    try {
      const result = await predictTaskDeadline(selectedTask, data, lang);
      setPredictionResult(result);
      showNotification("Previsão gerada pela IA!");
    } catch (err) {
      showNotification("Falha na previsão.");
    } finally {
      setIsPredictingDeadline(false);
    }
  };

  const applyPredictedDeadline = () => {
    if (!selectedTaskId || !predictionResult) return;
    const date = new Date(predictionResult.suggestedDate).getTime();
    updateTask(selectedTaskId, { dueDate: date });
    setPredictionResult(null);
    showNotification("Novo prazo aplicado.");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTaskId || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const newAttachment: Attachment = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: file.type,
        size: (file.size / 1024).toFixed(1) + ' KB',
        url: url
      };
      const currentAttachments = data.tasks[selectedTaskId].attachments || [];
      updateTask(selectedTaskId, { attachments: [...currentAttachments, newAttachment] });
      showNotification(`Arquivo "${file.name}" anexado.`);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSmartPrioritize = async () => {
    if (!prioritizeCriteria.trim()) return;
    setIsPrioritizing(true);
    setShowPrioritizeModal(false);
    showNotification(t.insightsLoading);
    try {
      const result: PrioritizationResult = await prioritizeBoardWithAI(data, prioritizeCriteria, lang);
      const updatedTasks = { ...data.tasks };
      Object.entries(result.priorityChanges).forEach(([tid, p]) => {
        if (updatedTasks[tid]) updatedTasks[tid] = { ...updatedTasks[tid], priority: p as Priority };
      });
      const updatedColumns = { ...data.columns };
      Object.entries(result.columnOrders).forEach(([cid, taskIds]) => {
        if (updatedColumns[cid]) updatedColumns[cid] = { ...updatedColumns[cid], taskIds };
      });
      setData(prev => ({ ...prev, tasks: updatedTasks, columns: updatedColumns }));
      setInsights(result.insight);
      showNotification(t.updateSuccess);
    } catch (err) {
      showNotification("Erro ao priorizar com IA.");
    } finally {
      setIsPrioritizing(false);
      setPrioritizeCriteria('');
    }
  };

  const addNewTask = (columnId: string) => {
    const taskId = `task-${Math.random().toString(36).substr(2, 9)}`;
    const newTask: Task = { id: taskId, title: 'Nova Tarefa', description: '', priority: Priority.LOW, tags: [], createdAt: Date.now(), subtasks: [], comments: [], attachments: [], icon: 'fa-tasks', assigneeId: user?.id };
    setData(prev => ({
      ...prev,
      tasks: { ...prev.tasks, [taskId]: newTask },
      columns: { ...prev.columns, [columnId]: { ...prev.columns[columnId], taskIds: [taskId, ...prev.columns[columnId].taskIds] } }
    }));
    setSelectedTaskId(taskId);
  };

  const handleAddComment = () => {
    if (!selectedTaskId || !newCommentText.trim() || !user) return;
    const newComment: Comment = { id: Math.random().toString(36).substr(2, 9), text: newCommentText.trim(), author: user.name, timestamp: Date.now() };
    const currentComments = data.tasks[selectedTaskId].comments || [];
    updateTask(selectedTaskId, { comments: [...currentComments, newComment] });
    setNewCommentText('');
    showNotification("Comentário adicionado");
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      name: email.split('@')[0].toUpperCase(),
      email, role: 'admin', lang: 'pt', points: 100,
      photoURL: `https://ui-avatars.com/api/?name=${email[0]}&background=f3b032&color=fff`,
      notifications: DEFAULT_NOTIFICATIONS
    };
    setUser(newUser);
    localStorage.setItem('vieira_session_user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    localStorage.removeItem('vieira_session_user');
    setUser(null);
  };

  const updateUserSettings = (updates: Partial<User>) => {
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    localStorage.setItem('vieira_session_user', JSON.stringify(updatedUser));
  };

  if (!user) {
    return (
      <main className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#111] p-8 rounded-2xl border border-white/5 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <BrandLogo size="lg" />
            <p className="text-slate-200 text-[10px] font-bold tracking-[0.3em] uppercase mt-4">Login no Workspace</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1 tracking-widest">E-mail Corporativo</label>
              <input id="login-email" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#f3b032]/50 transition-all text-white" />
            </div>
            <div>
              <label htmlFor="login-pass" className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1 tracking-widest">Senha de Acesso</label>
              <input id="login-pass" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#f3b032]/50 transition-all text-white" />
            </div>
            <button type="submit" className="w-full bg-[#f3b032] text-black font-black py-4 rounded-xl hover:bg-[#ffc24f] transition-all text-xs uppercase tracking-widest mt-4 shadow-lg shadow-[#f3b032]/10">Entrar no Sistema</button>
          </form>
        </div>
      </main>
    );
  }

  const selectedTask = selectedTaskId ? data.tasks[selectedTaskId] : null;
  const isSelectedTaskFinished = selectedTaskId ? data.columns['col-3'].taskIds.includes(selectedTaskId) : false;

  return (
    <div className="h-screen flex flex-col bg-[#050505] text-slate-100">
      <header className="h-16 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-md flex items-center justify-between px-6 z-50 shrink-0 gap-4">
        <div className="flex items-center gap-6">
          <BrandLogo size="sm" />
          <nav className="hidden xl:flex items-center gap-1 bg-white/5 p-1 rounded-lg">
            <button onClick={() => setShowDashboard(false)} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${!showDashboard ? 'bg-[#f3b032] text-black shadow-md' : 'text-slate-200 hover:text-white'}`}>Quadro</button>
            <button onClick={() => setShowDashboard(true)} className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${showDashboard ? 'bg-[#f3b032] text-black shadow-md' : 'text-slate-200 hover:text-white'}`}>Insights</button>
          </nav>
        </div>

        <div className="flex-1 max-w-2xl flex items-center gap-4">
          <div className="relative group flex-1 hidden md:block">
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input type="text" placeholder="Pesquisar tarefas..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2 text-xs outline-none focus:border-[#f3b032]/80 transition-all" />
          </div>
          <button onClick={() => setShowPrioritizeModal(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#f3b032] hover:bg-[#f3b032]/10 transition-all border border-white/10">
            <i className="fas fa-wand-magic-sparkles"></i>
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setShowProfileModal(true)} className="hover:opacity-80 transition-all">
            <img src={user.photoURL} className="w-9 h-9 rounded-xl border-2 border-[#f3b032]/30 shadow-lg" alt="Perfil" />
          </button>
        </div>
      </header>

      <main id="main-content" className="flex-1 overflow-x-auto p-6 kanban-container relative bg-grid-white/[0.03]">
        {showDashboard ? (
          <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
            {/* Dashboard simplificado com Recharts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#121212] p-6 rounded-2xl border border-white/10 shadow-xl">
                <h3 className="text-[10px] font-black text-slate-200 uppercase tracking-widest mb-6">Distribuição</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ name: 'To Do', value: data.columns['col-1'].taskIds.length, fill: '#f3b032' }, { name: 'Done', value: data.columns['col-3'].taskIds.length, fill: '#10b981' }]} innerRadius={40} outerRadius={60} dataKey="value" />
                      <Tooltip contentStyle={{ background: '#111', border: 'none' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-[#121212] p-6 rounded-2xl border border-white/10 shadow-xl col-span-2">
                <h3 className="text-[10px] font-black text-slate-200 uppercase tracking-widest mb-6">Velocidade</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[{d:'S',v:4},{d:'T',v:7},{d:'Q',v:5},{d:'Q',v:10}]}>
                      <Area type="monotone" dataKey="v" stroke="#f3b032" fill="#f3b032" fillOpacity={0.1} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-6 items-start h-full">
            {data.columnOrder.map(colId => {
              const column = data.columns[colId];
              const taskIds = column.taskIds.filter(tid => {
                const t = data.tasks[tid];
                if (filterAssigneeId && t.assigneeId !== filterAssigneeId) return false;
                const q = searchQuery.toLowerCase();
                return t.title.toLowerCase().includes(q) || t.tags.some(tg => tg.toLowerCase().includes(q));
              });

              return (
                <section key={colId} className="w-[310px] flex flex-col h-full bg-[#121212] border-x border-white/10 shrink-0 shadow-lg">
                  <div className="p-4 flex items-center justify-between border-b border-white/20 bg-white/5">
                    <div className="flex items-center gap-2">
                      <h2 className="font-black text-[11px] uppercase tracking-[0.1em] text-white">{column.title}</h2>
                      <span className="text-[10px] bg-white/10 px-2 rounded-full text-white font-black">{taskIds.length}</span>
                    </div>
                    <button onClick={() => addNewTask(colId)} className="w-7 h-7 rounded-lg hover:bg-[#f3b032] hover:text-black transition-all flex items-center justify-center text-slate-200 border border-white/10">
                      <i className="fas fa-plus text-[12px]"></i>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
                    {taskIds.map(tid => {
                      const task = data.tasks[tid];
                      const totalSub = task.subtasks.length;
                      const doneSub = task.subtasks.filter(s => s.completed).length;
                      const progress = totalSub > 0 ? (doneSub / totalSub) * 100 : 0;
                      
                      return (
                        <div key={tid} onClick={() => setSelectedTaskId(tid)} className={`bg-[#1e1e1e] border-2 ${selectedTaskId === tid ? 'border-[#f3b032]' : 'border-white/10'} p-4 rounded-xl hover:border-[#f3b032]/60 cursor-pointer transition-all shadow-xl group`}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <h3 className={`text-sm font-bold leading-tight ${colId === 'col-3' ? 'text-slate-400 line-through' : 'text-white'}`}>
                              {task.title}
                            </h3>
                            <i className={`fas ${task.icon || 'fa-tasks'} text-[#f3b032] text-xs`}></i>
                          </div>
                          
                          {/* Barra de Progresso no Card */}
                          {totalSub > 0 && (
                            <div className="mt-3 space-y-1.5">
                              <div className="flex justify-between text-[9px] font-black uppercase text-slate-500 tracking-tighter">
                                <span>Progresso</span>
                                <span>{doneSub}/{totalSub}</span>
                              </div>
                              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-500 ${progress === 100 ? 'bg-green-500' : 'bg-[#f3b032]'}`} style={{ width: `${progress}%` }} />
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${task.priority === Priority.HIGH ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-white/5 text-slate-400 border-white/10'}`}>
                              {task.priority}
                            </span>
                            {task.assigneeId && (
                              <img src={MOCK_TEAM.find(u => u.id === task.assigneeId)?.photoURL} className="w-5 h-5 rounded-full border border-white/20" alt="" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      {/* Detail Sidebar */}
      {selectedTaskId && selectedTask && (
        <aside className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedTaskId(null)} />
          <div className="relative w-full max-w-md h-full bg-[#0a0a0a] border-l-4 border-[#f3b032]/40 p-8 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <i className={`fas ${selectedTask.icon || 'fa-tasks'} text-xl text-[#f3b032]`}></i>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Tarefa Detalhada</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleTaskCompletion(selectedTaskId)} className={`px-4 py-2 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${isSelectedTaskFinished ? 'bg-green-600/20 text-green-400 border-green-500/30' : 'bg-white/5 text-slate-300 border-white/10 hover:text-green-400 hover:border-green-400'}`}>
                  {isSelectedTaskFinished ? 'Reabrir' : 'Concluir'}
                </button>
                <button onClick={() => setSelectedTaskId(null)} className="w-10 h-10 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-200 border border-white/10"><i className="fas fa-times text-lg"></i></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 pr-3 custom-scrollbar">
              {/* Presença Simulada */}
              <div className="flex items-center gap-2 p-3 bg-[#f3b032]/5 rounded-xl border border-[#f3b032]/10 animate-pulse">
                <div className="flex -space-x-2">
                  <img src={MOCK_TEAM[1].photoURL} className="w-5 h-5 rounded-full border border-[#0a0a0a]" alt="" />
                  <img src={MOCK_TEAM[2].photoURL} className="w-5 h-5 rounded-full border border-[#0a0a0a]" alt="" />
                </div>
                <span className="text-[10px] font-bold text-[#f3b032] uppercase tracking-widest">Bruno e Carla estão visualizando</span>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Título</label>
                <input type="text" value={selectedTask.title} onChange={e => updateTask(selectedTaskId, { title: e.target.value })} className="w-full bg-white/5 border-2 border-white/10 rounded-xl px-5 py-4 text-base font-bold text-white focus:border-[#f3b032] outline-none" />
              </div>

              {/* Seção de Checklist de Subtarefas */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1 flex items-center gap-2">
                    <i className="fas fa-list-check"></i> Subentregas
                  </h3>
                  <button onClick={handleSmartBreakdown} disabled={isBreakingDown} className="text-[9px] font-black uppercase text-[#f3b032] hover:text-white transition-all bg-[#f3b032]/10 px-2 py-1 rounded-lg border border-[#f3b032]/20 flex items-center gap-2">
                    <i className={`fas ${isBreakingDown ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
                    Magia IA
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedTask.subtasks.map(sub => (
                    <div key={sub.id} onClick={() => toggleSubtask(selectedTaskId, sub.id)} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${sub.completed ? 'bg-white/5 border-white/5' : 'bg-white/[0.02] border-white/10 hover:border-white/20'}`}>
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-all ${sub.completed ? 'bg-green-500 border-green-500' : 'border-white/20'}`}>
                        {sub.completed && <i className="fas fa-check text-[10px] text-black"></i>}
                      </div>
                      <span className={`text-xs font-medium ${sub.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{sub.title}</span>
                    </div>
                  ))}
                  <button onClick={() => updateTask(selectedTaskId, { subtasks: [...selectedTask.subtasks, { id: Math.random().toString(36).substr(2, 9), title: 'Nova Subtarefa', completed: false }] })} className="w-full p-3 rounded-xl border-2 border-dashed border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-white/20 hover:text-slate-400 transition-all">
                    + Adicionar Item
                  </button>
                </div>
              </section>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Prazo Inteligente</label>
                  <button onClick={handlePredictDeadline} disabled={isPredictingDeadline} className="text-[9px] font-black uppercase text-[#f3b032] bg-[#f3b032]/10 px-2 py-1 rounded-lg border border-[#f3b032]/20">IA Prever</button>
                </div>
                <input type="date" value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().split('T')[0] : ''} onChange={e => updateTask(selectedTaskId, { dueDate: e.target.value ? new Date(e.target.value).getTime() : undefined })} className="w-full bg-white/5 border-2 border-white/10 rounded-xl px-5 py-4 text-sm font-bold text-white focus:border-[#f3b032] outline-none" />
                {predictionResult && (
                  <div className="p-4 bg-[#f3b032]/10 border-2 border-[#f3b032]/30 rounded-xl">
                    <p className="text-xs text-white font-bold mb-3">{predictionResult.reasoning}</p>
                    <button onClick={applyPredictedDeadline} className="w-full py-2 bg-[#f3b032] text-black text-[10px] font-black uppercase rounded-lg">Aplicar {new Date(predictionResult.suggestedDate).toLocaleDateString()}</button>
                  </div>
                )}
              </div>

              <div className="space-y-6 pt-6">
                <h3 className="text-[10px] font-black uppercase text-[#f3b032] tracking-[0.3em] flex items-center gap-2"><i className="fas fa-comments"></i> Diálogo</h3>
                <div className="flex gap-3">
                  <input type="text" value={newCommentText} onChange={e => setNewCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddComment()} placeholder="Nota rápida..." className="flex-1 bg-white/10 border-2 border-white/10 rounded-xl px-5 py-3 text-sm text-white focus:border-[#f3b032] outline-none" />
                  <button onClick={handleAddComment} className="w-12 h-12 bg-[#f3b032] text-black rounded-xl flex items-center justify-center hover:bg-[#ffc24f] transition-all"><i className="fas fa-paper-plane"></i></button>
                </div>
                <div className="space-y-4">
                  {(selectedTask.comments || []).map(comment => (
                    <div key={comment.id} className="bg-white/5 p-4 rounded-xl border-l-4 border-white/20">
                      <div className="flex justify-between mb-2">
                        <span className="text-[10px] font-black text-[#f3b032] uppercase">{comment.author}</span>
                        <span className="text-[10px] text-slate-500">{new Date(comment.timestamp).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-slate-200">{comment.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Prioritize Criteria Modal */}
      {showPrioritizeModal && (
        <aside className="fixed inset-0 z-[300] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowPrioritizeModal(false)} />
          <div className="relative w-full max-w-lg bg-[#0f0f0f] border-2 border-white/20 rounded-[2rem] p-8 shadow-2xl">
            <h2 className="text-xl font-black uppercase tracking-widest text-white mb-6">IA Ordenação</h2>
            <textarea value={prioritizeCriteria} onChange={e => setPrioritizeCriteria(e.target.value)} placeholder="Ex: 'Priorize por prazos críticos'..." className="w-full h-32 bg-white/5 border-2 border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-[#f3b032] outline-none resize-none mb-6" />
            <div className="flex gap-4">
              <button onClick={() => setShowPrioritizeModal(false)} className="flex-1 py-4 bg-white/5 border-2 border-white/10 rounded-2xl text-xs font-black uppercase text-slate-300">Cancelar</button>
              <button onClick={handleSmartPrioritize} className="flex-1 py-4 bg-[#f3b032] text-black rounded-2xl text-xs font-black uppercase shadow-lg">Otimizar Quadro</button>
            </div>
          </div>
        </aside>
      )}

      {/* Profile/Settings Modal */}
      {showProfileModal && (
        <aside className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowProfileModal(false)} />
          <div className="relative w-full max-w-2xl bg-[#0f0f0f] border-2 border-white/20 rounded-[2.5rem] p-10 shadow-2xl">
            <h2 className="text-3xl font-black uppercase text-white mb-10">Sistema</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <h3 className="text-[11px] font-black text-[#f3b032] uppercase tracking-[0.4em]">Identidade</h3>
                <input type="text" value={user.name} onChange={e => updateUserSettings({ name: e.target.value })} className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white font-bold outline-none" />
                <select value={lang} onChange={e => {setLang(e.target.value as Language); updateUserSettings({ lang: e.target.value as any })}} className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white font-bold outline-none">
                  <option value="pt">PORTUGUÊS</option>
                  <option value="en">ENGLISH</option>
                </select>
              </div>
              <div className="space-y-6">
                <h3 className="text-[11px] font-black text-[#f3b032] uppercase tracking-[0.4em]">Notificações</h3>
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border-2 border-white/10">
                  <span className="text-xs font-bold text-white">SLACK SYNC</span>
                  <button onClick={() => updateUserSettings({ notifications: { ...user.notifications, slackEnabled: !user.notifications.slackEnabled }})} className={`w-10 h-5 rounded-full relative transition-all ${user.notifications.slackEnabled ? 'bg-[#f3b032]' : 'bg-white/10'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${user.notifications.slackEnabled ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-12 flex justify-center">
              <button onClick={handleLogout} className="px-10 py-4 bg-red-600/10 text-red-500 border-2 border-red-500/30 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all">Encerrar Sessão</button>
            </div>
          </div>
        </aside>
      )}

      {/* Global Notifications */}
      {notification && (
        <div className="fixed bottom-24 right-8 z-[300] animate-in fade-in slide-in-from-bottom-5">
          <div className="bg-[#f3b032] text-black px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl">
            {notification}
          </div>
        </div>
      )}

      {/* IA Insights Bar */}
      <div className="fixed bottom-6 right-6 left-6 h-12 glass border-2 border-white/10 rounded-2xl px-5 flex items-center gap-4 shadow-2xl z-40">
        <i className="fas fa-wand-magic-sparkles text-[#f3b032] text-lg"></i>
        <p className="text-[11px] font-black text-white italic truncate">{insights}</p>
      </div>
    </div>
  );
};

export default App;
