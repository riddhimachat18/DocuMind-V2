import React, { createContext, useContext, useState } from 'react';

export interface Project {
  id: string;
  name: string;
  description: string;
  lastUpdated: string;
  qualityScore: number;
  sources: string[];
  members: { name: string; role: string; email: string }[];
}

interface AppContextType {
  isAuthenticated: boolean;
  user: { name: string; email: string; org: string } | null;
  projects: Project[];
  login: (email: string, name?: string, org?: string) => void;
  logout: () => void;
  addProject: (project: Project) => void;
}

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    name: 'Customer Portal Redesign',
    description: 'Full redesign of the customer-facing portal with new UX flows and API integrations.',
    lastUpdated: '2026-02-18',
    qualityScore: 84,
    sources: ['gmail', 'slack'],
    members: [
      { name: 'Sarah Chen', role: 'Product Owner', email: 'sarah@acme.com' },
      { name: 'James Rao', role: 'Tech Lead', email: 'james@acme.com' },
    ],
  },
  {
    id: 'proj-2',
    name: 'Payment Gateway Integration',
    description: 'Integrate Stripe and local payment rails into the checkout flow.',
    lastUpdated: '2026-02-15',
    qualityScore: 67,
    sources: ['slack', 'meeting'],
    members: [
      { name: 'Alex Kim', role: 'Business Analyst', email: 'alex@acme.com' },
    ],
  },
  {
    id: 'proj-3',
    name: 'Data Warehouse Migration',
    description: 'Migrate legacy Oracle DW to Snowflake. Includes ETL pipelines and reporting.',
    lastUpdated: '2026-02-10',
    qualityScore: 42,
    sources: ['gmail'],
    members: [
      { name: 'Maria Lopez', role: 'Data Architect', email: 'maria@acme.com' },
      { name: 'Tom Walsh', role: 'Project Manager', email: 'tom@acme.com' },
    ],
  },
];

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AppContextType['user']>(null);
  const [projects, setProjects] = useState<Project[]>(mockProjects);

  const login = (email: string, name = 'Alex Johnson', org = 'Acme Corp') => {
    setUser({ name, email, org });
    setIsAuthenticated(true);
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
  };

  const addProject = (project: Project) => {
    setProjects(prev => [project, ...prev]);
  };

  return (
    <AppContext.Provider value={{ isAuthenticated, user, projects, login, logout, addProject }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
