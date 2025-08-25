
import React, { useState, useEffect, useCallback, useContext, createContext, useMemo, useRef } from 'react';
import { User, MediaFile, ToastMessage, ViewMode } from './types';
import { generateTagsForImage } from './services/geminiService';
import { CloseIcon, CopyIcon, DownloadIcon, EyeIcon, FolderIcon, GridIcon, GuardMidiaLogo, ListIcon, LogoutIcon, MoonIcon, SearchIcon, SunIcon, TagIcon, UploadIcon } from './components/Icons';

// UTILITY FUNCTIONS
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getImageDimensions = (dataUrl: string): Promise<{ width: number, height: number }> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.src = dataUrl;
  });

// HOOKS
const useLocalStorage = <T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
};

// CONTEXTS
// Theme Context
type Theme = 'light' | 'dark';
type ThemeContextType = { theme: Theme; toggleTheme: () => void };
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useLocalStorage<Theme>('theme', 'light');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(theme === 'light' ? 'dark' : 'light');
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

// Toast Context
type ToastContextType = { addToast: (message: string, type: ToastMessage['type']) => void };
const ToastContext = createContext<ToastContextType | undefined>(undefined);

const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: ToastMessage['type']) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };
  
  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 w-full max-w-xs space-y-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} message={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};

// Auth Context
type AuthContextType = {
  user: User | null;
  login: (user: User) => boolean;
  logout: () => void;
  register: (user: User) => boolean;
};
const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('currentUser');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [users, setUsers] = useLocalStorage<Record<string, string>>('users', {});

  const login = (credentials: User) => {
    if (users[credentials.username] && users[credentials.username] === credentials.password) {
      const loggedInUser = { username: credentials.username };
      setUser(loggedInUser);
      localStorage.setItem('currentUser', JSON.stringify(loggedInUser));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('currentUser');
  };

  const register = (credentials: User) => {
    if (users[credentials.username]) {
      return false; // User already exists
    }
    setUsers(prev => ({ ...prev, [credentials.username]: credentials.password! }));
    return true;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
};
const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};


// Media Context
type MediaContextType = {
  media: MediaFile[];
  addMedia: (files: Omit<MediaFile, 'id' | 'uploadDate' | 'views'>[]) => void;
  deleteMedia: (id: string) => void;
  updateMedia: (id: string, updates: Partial<MediaFile>) => void;
  categories: string[];
  incrementView: (id: string) => void;
  backupData: () => void;
  restoreData: (event: React.ChangeEvent<HTMLInputElement>) => void;
};
const MediaContext = createContext<MediaContextType | undefined>(undefined);

const MediaProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [media, setMedia] = useLocalStorage<MediaFile[]>(`media_${user?.username}`, []);
  const { addToast } = useToast();

  const addMedia = (files: Omit<MediaFile, 'id' | 'uploadDate' | 'views'>[]) => {
    const newMediaItems: MediaFile[] = files.map(file => ({
      ...file,
      id: `${Date.now()}-${Math.random()}`,
      uploadDate: new Date().toISOString(),
      views: 0,
    }));
    setMedia(prev => [...newMediaItems, ...prev]);
  };
  
  const deleteMedia = (id: string) => {
    setMedia(prev => prev.filter(item => item.id !== id));
  };
  
  const updateMedia = (id: string, updates: Partial<MediaFile>) => {
    setMedia(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const incrementView = (id: string) => {
     updateMedia(id, { views: (media.find(m => m.id === id)?.views || 0) + 1 });
  }

  const categories = useMemo(() => {
    const allCategories = media.map(m => m.category);
    return ['Todos', ...Array.from(new Set(allCategories)).filter(Boolean)];
  }, [media]);

  const backupData = () => {
    if(!user) return;
    try {
      const dataStr = JSON.stringify(media, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      const exportFileDefaultName = `guardmidia_backup_${user.username}_${new Date().toISOString().split('T')[0]}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      addToast('Backup criado com sucesso!', 'success');
    } catch(e) {
      addToast('Falha ao criar o backup.', 'error');
    }
  };

  const restoreData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text === 'string') {
          const restoredMedia = JSON.parse(text);
          // basic validation
          if (Array.isArray(restoredMedia) && restoredMedia.every(item => item.id && item.name && item.dataUrl)) {
            setMedia(restoredMedia);
            addToast('Dados restaurados com sucesso!', 'success');
          } else {
            throw new Error("Invalid backup file format.");
          }
        }
      } catch (error) {
        console.error("Restore error: ", error);
        addToast('Falha ao restaurar dados. Arquivo inválido.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };
  
  return (
    <MediaContext.Provider value={{ media, addMedia, deleteMedia, updateMedia, categories, incrementView, backupData, restoreData }}>
      {children}
    </MediaContext.Provider>
  );
};
const useMedia = () => {
  const context = useContext(MediaContext);
  if (!context) throw new Error('useMedia must be used within a MediaProvider');
  return context;
};

// UI COMPONENTS
const Button = ({ children, onClick, className = '', variant = 'primary', type = 'button', disabled = false }: { children: React.ReactNode, onClick?: () => void, className?: string, variant?: 'primary' | 'secondary' | 'danger', type?: 'button' | 'submit', disabled?: boolean }) => {
  const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-dark-surface disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses = {
    primary: 'bg-brand-primary text-white hover:bg-brand-secondary focus:ring-brand-primary',
    secondary: 'bg-gray-200 dark:bg-dark-border text-gray-800 dark:text-dark-text-primary hover:bg-gray-300 dark:hover:bg-gray-600 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };
  return <button type={type} onClick={onClick} disabled={disabled} className={`${baseClasses} ${variantClasses[variant]} ${className}`}>{children}</button>;
};

const Input = ({ type = 'text', placeholder, value, onChange, className = '' }: { type?: string, placeholder?: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, className?: string }) => {
  return <input type={type} placeholder={placeholder} value={value} onChange={onChange} className={`w-full p-2 rounded-md bg-gray-100 dark:bg-dark-surface border border-gray-300 dark:border-dark-border focus:ring-2 focus:ring-brand-primary focus:border-transparent outline-none transition-all ${className}`} />;
};

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-40 flex justify-center items-center animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-lg m-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 border-b dark:border-dark-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800 dark:text-dark-text-primary">{title}</h2>
          <button onClick={onClose} className="text-gray-500 dark:text-dark-text-secondary hover:text-gray-800 dark:hover:text-dark-text-primary transition-colors">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

const Spinner = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-4',
    lg: 'w-12 h-12 border-4',
  };
  return <div className={`animate-spinner-spin rounded-full border-brand-primary border-t-transparent ${sizeClasses[size]}`}></div>;
};

const Toast = ({ message, onDismiss }: { message: ToastMessage, onDismiss: () => void }) => {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 500); // match animation duration
    }, 4500);

    return () => clearTimeout(timer);
  }, [onDismiss]);
  
  const handleDismiss = () => {
     setExiting(true);
     setTimeout(onDismiss, 500);
  }

  const baseClasses = 'rounded-lg shadow-lg p-4 flex items-center space-x-3 text-white';
  const typeClasses = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  };

  return (
    <div className={`${baseClasses} ${typeClasses[message.type]} ${exiting ? 'animate-toast-out' : 'animate-toast-in'}`} role="alert">
      <span className="flex-grow">{message.message}</span>
      <button onClick={handleDismiss} className="text-lg leading-none">&times;</button>
    </div>
  );
};

// MEDIA COMPONENTS
const UploadModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { addMedia } = useMedia();
  const { addToast } = useToast();

  const resetState = useCallback(() => {
    setFiles([]);
    setPreviews([]);
    setCategory('');
    setIsUploading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  const handleFileChange = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles = Array.from(selectedFiles).filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        addToast(`Arquivo ${file.name} é muito grande (máx 5MB).`, 'error');
        return false;
      }
      return true;
    });
    setFiles(prev => [...prev, ...newFiles]);
  };
  
  useEffect(() => {
    let newPreviews: string[] = [];
    let loadedCount = 0;
    if(files.length === 0) {
      setPreviews([]);
      return;
    }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviews.push(reader.result as string);
        loadedCount++;
        if (loadedCount === files.length) {
          setPreviews(newPreviews);
        }
      };
      reader.readAsDataURL(file);
    });
  }, [files]);
  
  const handleUpload = async () => {
    if (files.length === 0) {
      addToast('Por favor, selecione os arquivos para enviar.', 'info');
      return;
    }
    setIsUploading(true);
    
    try {
      const mediaToUpload = await Promise.all(
        files.map(async (file) => {
          const dataUrl = await fileToBase64(file);
          const base64Data = dataUrl.split(',')[1];
          const mediaType: 'image' | 'video' = file.type.startsWith('image') ? 'image' : 'video';
          
          let tags: string[] = [];
          if(mediaType === 'image') {
              tags = await generateTagsForImage(base64Data, file.type);
          }

          let dimensions = { width: undefined, height: undefined };
          if(mediaType === 'image') {
             dimensions = await getImageDimensions(dataUrl);
          }

          return {
            name: file.name,
            type: mediaType,
            mimeType: file.type,
            size: file.size,
            dataUrl: dataUrl,
            category: category || 'Sem Categoria',
            tags,
            ...dimensions,
          };
        })
      );

      addMedia(mediaToUpload);
      addToast(`${files.length} arquivo(s) enviado(s) com sucesso!`, 'success');
      onClose();
    } catch(e) {
      addToast('Ocorreu um erro durante o envio.', 'error');
      console.error(e);
      setIsUploading(false);
    }
  };

  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, isEntering: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(isEntering);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    handleDragEvents(e, false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enviar Mídia">
        <div className="space-y-4">
            <div 
              onDragEnter={(e) => handleDragEvents(e, true)}
              onDragLeave={(e) => handleDragEvents(e, false)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragging ? 'border-brand-primary bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-dark-border hover:border-brand-primary'}`}
            >
              <input type="file" multiple onChange={(e) => handleFileChange(e.target.files)} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                  <UploadIcon className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                  <p className="mt-2 text-gray-600 dark:text-dark-text-secondary">Arraste e solte os arquivos aqui, ou clique para procurar</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Tamanho máximo do arquivo: 5MB</p>
              </label>
            </div>

            {previews.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-2 bg-gray-100 dark:bg-dark-bg rounded-md">
                    {previews.map((src, index) => (
                        <img key={index} src={src} alt={`preview ${index}`} className="w-full h-20 object-cover rounded" />
                    ))}
                </div>
            )}

            <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">Categoria (opcional)</label>
                <Input type="text" placeholder="ex: Natureza, Projetos..." value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>

            <div className="flex justify-end pt-4">
                <Button onClick={handleUpload} disabled={isUploading || files.length === 0} className="w-40">
                  {isUploading ? <Spinner size="sm" /> : `Enviar ${files.length} Arquivo(s)`}
                </Button>
            </div>
        </div>
    </Modal>
  );
};


const MediaItem = ({ item, viewMode, onSelect }: { item: MediaFile; viewMode: ViewMode; onSelect: (item: MediaFile) => void; }) => {
  const content = item.type === 'image' 
    ? <img src={item.dataUrl} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
    : <video src={item.dataUrl} className="w-full h-full object-cover" />;
    
  if (viewMode === ViewMode.LIST) {
    return (
      <div onClick={() => onSelect(item)} className="flex items-center p-2 space-x-4 bg-white dark:bg-dark-surface rounded-lg shadow-sm hover:shadow-md cursor-pointer transition-all duration-200">
        <div className="w-16 h-16 flex-shrink-0 rounded-md overflow-hidden bg-gray-200 dark:bg-dark-bg">
          {content}
        </div>
        <div className="flex-grow overflow-hidden">
          <p className="text-sm font-semibold text-gray-800 dark:text-dark-text-primary truncate">{item.name}</p>
          <p className="text-xs text-gray-500 dark:text-dark-text-secondary">{item.category}</p>
        </div>
        <div className="text-xs text-gray-500 dark:text-dark-text-secondary text-right flex-shrink-0">
          <p>{formatBytes(item.size)}</p>
          <div className="flex items-center justify-end gap-1 mt-1">
             <EyeIcon className="w-3 h-3"/> <span>{item.views}</span>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div onClick={() => onSelect(item)} className="group relative aspect-w-1 aspect-h-1 bg-white dark:bg-dark-surface rounded-lg overflow-hidden shadow-sm hover:shadow-xl cursor-pointer transition-all duration-300 transform hover:-translate-y-1">
      {content}
      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex flex-col justify-end p-3 text-white">
        <p className="text-sm font-bold truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-4 group-hover:translate-y-0">{item.name}</p>
      </div>
    </div>
  );
};

const MediaGrid = () => {
  const { media } = useMedia();
  const [filteredMedia, setFilteredMedia] = useState<MediaFile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>(`viewMode`, ViewMode.GRID);
  const [selectedItem, setSelectedItem] = useState<MediaFile | null>(null);

  useEffect(() => {
    const lowerCaseSearch = searchTerm.toLowerCase();
    const result = media.filter(item => {
      const inCategory = activeCategory === 'Todos' || item.category === activeCategory;
      const matchesSearch = item.name.toLowerCase().includes(lowerCaseSearch) ||
                            item.category.toLowerCase().includes(lowerCaseSearch) ||
                            item.tags.some(tag => tag.toLowerCase().includes(lowerCaseSearch));
      return inCategory && matchesSearch;
    });
    setFilteredMedia(result);
  }, [media, searchTerm, activeCategory]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <MediaControls
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />
      {filteredMedia.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 dark:text-dark-text-secondary">Nenhuma mídia encontrada. Tente enviar algo!</p>
        </div>
      ) : (
        <div className={viewMode === ViewMode.GRID 
          ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
          : "space-y-2"}>
          {filteredMedia.map(item => (
            <MediaItem key={item.id} item={item} viewMode={viewMode} onSelect={setSelectedItem} />
          ))}
        </div>
      )}
      {selectedItem && (
        <MediaDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
};


const MediaControls = ({ searchTerm, setSearchTerm, activeCategory, setActiveCategory, viewMode, setViewMode }: { searchTerm: string, setSearchTerm: (s: string) => void, activeCategory: string, setActiveCategory: (c: string) => void, viewMode: ViewMode, setViewMode: (v: ViewMode) => void }) => {
    const { categories } = useMedia();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleWheel = (e: React.WheelEvent) => {
        if(scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft += e.deltaY;
        }
    };

    return (
        <div className="mb-6 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="relative w-full md:flex-grow">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, categoria ou tag de IA..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 p-2 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border focus:ring-2 focus:ring-brand-primary outline-none transition-all"
                    />
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-dark-surface p-1 rounded-lg border border-gray-300 dark:border-dark-border">
                    <button onClick={() => setViewMode(ViewMode.GRID)} className={`p-1.5 rounded-md ${viewMode === ViewMode.GRID ? 'bg-brand-primary text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border'}`}>
                        <ListIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => setViewMode(ViewMode.LIST)} className={`p-1.5 rounded-md ${viewMode === ViewMode.LIST ? 'bg-brand-primary text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border'}`}>
                        <GridIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
            <div className="relative">
                <div ref={scrollContainerRef} onWheel={handleWheel} className="flex space-x-2 overflow-x-auto pb-2 -mb-2 no-scrollbar">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-brand-primary text-white' : 'bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};


const MediaDetailModal = ({ item, onClose }: { item: MediaFile, onClose: () => void }) => {
    const { incrementView, deleteMedia } = useMedia();
    const { addToast } = useToast();
    const hasBeenViewed = useRef(false);

    useEffect(() => {
        if (!hasBeenViewed.current) {
            incrementView(item.id);
            hasBeenViewed.current = true;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id]);

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text).then(() => {
            addToast(`Link ${label} copiado!`, 'success');
        }, () => {
            addToast(`Falha ao copiar o link ${label}.`, 'error');
        });
    };
    
    const links = {
        Direto: item.dataUrl,
        HTML: `<img src="${item.dataUrl}" alt="${item.name}" />`,
        BBCode: `[img]${item.dataUrl}[/img]`,
        Markdown: `![${item.name}](${item.dataUrl})`,
    };

    const handleDelete = () => {
        if(window.confirm(`Tem certeza que deseja deletar "${item.name}"? Esta ação não pode ser desfeita.`)) {
            deleteMedia(item.id);
            addToast(`"${item.name}" foi deletado.`, 'info');
            onClose();
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-6xl h-full max-h-[95vh] m-4 flex flex-col lg:flex-row overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="w-full lg:w-3/4 bg-black flex justify-center items-center p-4">
                    {item.type === 'image' 
                        ? <img src={item.dataUrl} alt={item.name} className="max-w-full max-h-full object-contain" />
                        : <video src={item.dataUrl} controls className="max-w-full max-h-full object-contain" />
                    }
                </div>
                <div className="w-full lg:w-1/4 p-6 flex flex-col overflow-y-auto">
                    <div className="flex-grow space-y-4">
                        <div className="flex justify-between items-start">
                             <h3 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary break-all">{item.name}</h3>
                             <button onClick={onClose} className="text-gray-500 dark:text-dark-text-secondary hover:text-gray-800 dark:hover:text-dark-text-primary transition-colors ml-4 -mt-2 -mr-2 p-2">
                                <CloseIcon className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="text-sm text-gray-600 dark:text-dark-text-secondary space-y-1">
                            <p><strong>Enviado em:</strong> {new Date(item.uploadDate).toLocaleDateString()}</p>
                            <p><strong>Tamanho:</strong> {formatBytes(item.size)}</p>
                            {item.width && <p><strong>Dimensões:</strong> {item.width} x {item.height}</p>}
                            <p className="flex items-center gap-1.5"><FolderIcon className="w-4 h-4" /> {item.category}</p>
                            <p className="flex items-center gap-1.5"><EyeIcon className="w-4 h-4"/> {item.views} visualizações</p>
                        </div>

                        {item.tags.length > 0 && (
                            <div>
                                <h4 className="font-semibold mb-2 flex items-center gap-2"><TagIcon className="w-5 h-5"/> Tags de IA</h4>
                                <div className="flex flex-wrap gap-2">
                                    {item.tags.map(tag => <span key={tag} className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">{tag}</span>)}
                                </div>
                            </div>
                        )}

                        <div>
                            <h4 className="font-semibold mb-2">Links de Compartilhamento</h4>
                            <div className="space-y-2">
                                {Object.entries(links).map(([label, link]) => (
                                    <div key={label}>
                                        <label className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">{label}</label>
                                        <div className="flex items-center">
                                            <input type="text" readOnly value={link} className="w-full p-1.5 text-xs rounded-l-md bg-gray-100 dark:bg-dark-bg border border-gray-300 dark:border-dark-border focus:ring-0 outline-none" />
                                            <button onClick={() => copyToClipboard(link, label)} className="p-2 bg-gray-200 dark:bg-dark-border rounded-r-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                                <CopyIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                     <div className="mt-6 pt-4 border-t dark:border-dark-border flex flex-col sm:flex-row gap-2">
                        <Button onClick={() => window.open(item.dataUrl, '_blank')} className="w-full">
                           <DownloadIcon className="w-5 h-5"/> Baixar
                        </Button>
                        <Button onClick={handleDelete} variant="danger" className="w-full">
                           Deletar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// LAYOUT COMPONENTS
const Header = ({ onUploadClick }: { onUploadClick: () => void }) => {
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useAuth();
    const { backupData, restoreData } = useMedia();
    const restoreInputRef = useRef<HTMLInputElement>(null);

    return (
        <header className="bg-white dark:bg-dark-surface shadow-md sticky top-0 z-30 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-2">
                    <GuardMidiaLogo className="w-8 h-8 text-brand-primary" />
                    <h1 className="text-xl font-bold text-gray-800 dark:text-dark-text-primary hidden sm:block">GuardMídia</h1>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                    <Button onClick={onUploadClick}>
                        <UploadIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">Enviar</span>
                    </Button>
                    <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-dark-border transition-colors">
                        {theme === 'light' ? <MoonIcon className="w-6 h-6 text-gray-700" /> : <SunIcon className="w-6 h-6 text-yellow-400" />}
                    </button>
                    {user && (
                        <div className="relative group">
                            <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center text-white font-bold cursor-pointer">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-dark-surface rounded-md shadow-lg py-1 z-40 opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all duration-200">
                                <span className="block px-4 py-2 text-sm text-gray-700 dark:text-dark-text-secondary">Logado como <strong>{user.username}</strong></span>
                                <button onClick={backupData} className="w-full text-left block px-4 py-2 text-sm text-gray-700 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-border">Fazer Backup</button>
                                <button onClick={() => restoreInputRef.current?.click()} className="w-full text-left block px-4 py-2 text-sm text-gray-700 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-border">Restaurar Dados</button>
                                <input type="file" accept=".json" ref={restoreInputRef} onChange={restoreData} className="hidden"/>
                                <div className="border-t border-gray-100 dark:border-dark-border my-1"></div>
                                <button onClick={logout} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                                   <LogoutIcon className="w-4 h-4"/> Sair
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

const AppLayout = () => {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        setIsUploadModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-dark-text-primary transition-colors duration-300">
      <Header onUploadClick={() => setIsUploadModalOpen(true)} />
      <main>
        <MediaGrid />
      </main>
      <UploadModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} />
    </div>
  );
};


// AUTH COMPONENTS
const AuthPage = ({ isLogin }: { isLogin: boolean }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login, register } = useAuth();
    const [showRegister, setShowRegister] = useState(!isLogin);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!username || !password) {
            setError('Usuário e senha são obrigatórios.');
            return;
        }

        let success = false;
        if(showRegister) {
            success = register({ username, password });
            if (!success) setError('Nome de usuário já existe.');
            else {
                login({ username, password }); // auto-login after register
            }
        } else {
            success = login({ username, password });
            if (!success) setError('Usuário ou senha inválidos.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-dark-bg transition-colors duration-300">
            <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-dark-surface rounded-xl shadow-lg">
                <div className="flex flex-col items-center">
                    <GuardMidiaLogo className="w-16 h-16 text-brand-primary" />
                    <h2 className="mt-4 text-2xl font-bold text-center text-gray-900 dark:text-dark-text-primary">{showRegister ? 'Criar Conta' : 'Bem-vindo de Volta'}</h2>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary">ao GuardMídia</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Input type="text" placeholder="Usuário" value={username} onChange={e => setUsername(e.target.value)} />
                    <Input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} />
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    <Button type="submit" className="w-full !py-3">
                        {showRegister ? 'Registrar' : 'Entrar'}
                    </Button>
                </form>
                <p className="text-center text-sm text-gray-600 dark:text-dark-text-secondary">
                    {showRegister ? 'Já tem uma conta?' : "Não tem uma conta?"}
                    <button onClick={() => { setShowRegister(!showRegister); setError(''); }} className="font-medium text-brand-primary hover:text-brand-secondary ml-1">
                        {showRegister ? 'Entrar' : 'Cadastre-se'}
                    </button>
                </p>
            </div>
        </div>
    );
};

// ROOT APP COMPONENT
function App() {
  const { user } = useAuth();
  
  if (!user) {
    return <AuthPage isLogin={true} />;
  }

  return (
    <MediaProvider>
      <AppLayout />
    </MediaProvider>
  );
}

// App Wrapper with all providers
export default function AppWrapper() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
            <App />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
