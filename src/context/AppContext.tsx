import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';

export interface Project {
  id: string;
  name: string;
  description: string;
  lastUpdated: string;
  qualityScore: number;
  sources: string[];
  members: { name: string; role: string; email: string }[];
  userId?: string;
  createdAt?: string;
  connectedSources?: Record<string, boolean>;
}

interface AppContextType {
  isAuthenticated: boolean;
  user: User | null;
  projects: Project[];
  loading: boolean;
  login: (email: string, name?: string, org?: string) => void;
  logout: () => void;
  addProject: (project: Project) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser ? 'User logged in' : 'User logged out');
      setUser(firebaseUser);
      setIsAuthenticated(!!firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch projects when user changes
  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }

    const mapDoc = async (d: any) => {
      const data = d.data();
      let qualityScore = 0;
      
      // Fetch quality score from current BRD version
      if (data.currentBrdVersionId) {
        try {
          const brdDoc = await getDoc(doc(db, "brdVersions", data.currentBrdVersionId));
          if (brdDoc.exists()) {
            const brdData = brdDoc.data();
            qualityScore = brdData.qualityScore?.total ?? 0;
          }
        } catch (e) {
          console.warn("Could not fetch quality score for", d.id);
        }
      }
      
      return {
        id: d.id,
        name: data.name || '',
        description: data.description || '',
        lastUpdated: data.lastUpdated?.toDate?.()?.toISOString().split('T')[0] || 
                     data.updatedAt?.toDate?.()?.toISOString().split('T')[0] || 
                     new Date().toISOString().split('T')[0],
        qualityScore,
        members: data.members || [],
        userId: data.userId || data.createdBy,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        // Map connectedSources to sources array for backward compat
        sources: Object.entries(data.connectedSources ?? {})
          .filter(([_, v]) => v === true)
          .map(([k]) => k),
        connectedSources: data.connectedSources ?? {},
      };
    };

    // Listen to projects by userId field
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const projectsData = await Promise.all(snapshot.docs.map(mapDoc));
        setProjects(projectsData);
      },
      (error) => {
        console.error('Error fetching projects:', error);
        // If there's an error (like missing index), just set empty array
        setProjects([]);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const login = (email: string, name = 'User', org = 'Organization') => {
    // This is handled by Firebase Auth now
    // Keep for backward compatibility but auth should use Firebase methods
  };

  const logout = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const addProject = (project: Project) => {
    // Projects are now added via Firestore, this is for backward compat
    setProjects(prev => [project, ...prev]);
  };

  return (
    <AppContext.Provider value={{ isAuthenticated, user, projects, loading, login, logout, addProject }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
