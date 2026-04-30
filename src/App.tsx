import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import NewProject from "./pages/NewProject";
import ProjectSettings from "./pages/ProjectSettings";
import BRDView from "./pages/BRDView";
import CreateBRDVersion from "./pages/CreateBRDVersion";
import BRDEdit from "./pages/BRDEdit";
import BRDHistory from "./pages/BRDHistory";
import NotFound from "./pages/NotFound";
import AdminValidation from "./pages/AdminValidation";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useApp();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const AppRoutes = () => {
  const { isAuthenticated, loading } = useApp();

  return (
    <Routes>
      {/* Public routes — Landing page always shows first, even during auth check */}
      <Route path="/" element={
        loading ? <Landing /> : (isAuthenticated ? <Navigate to="/dashboard" replace /> : <Landing />)
      } />
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />
      } />
      <Route path="/signup" element={
        isAuthenticated ? <Navigate to="/dashboard" replace /> : <Signup />
      } />

      {/* Protected routes */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/projects/new" element={<ProtectedRoute><NewProject /></ProtectedRoute>} />
      <Route path="/projects/:id/settings" element={<ProtectedRoute><ProjectSettings /></ProtectedRoute>} />
      <Route path="/projects/:id/brd" element={<ProtectedRoute><BRDView /></ProtectedRoute>} />
      <Route path="/projects/:id/brd/new" element={<ProtectedRoute><CreateBRDVersion /></ProtectedRoute>} />
      <Route path="/projects/:id/brd/edit" element={<ProtectedRoute><BRDEdit /></ProtectedRoute>} />
      <Route path="/projects/:id/brd/history" element={<ProtectedRoute><BRDHistory /></ProtectedRoute>} />
      <Route path="/admin/validation" element={<AdminValidation />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AppRoutes />
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
