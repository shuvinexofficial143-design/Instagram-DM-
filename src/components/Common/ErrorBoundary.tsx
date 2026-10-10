import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[UNCAUGHT_REACT_ERROR]', error, errorInfo);
    // During a deployment the previous page can point at a removed Vite
    // hashed chunk. A one-time cache-busted refresh loads the latest HTML.
    const msg=String(error?.message||error||'');
    if(/dynamically imported module|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)){
      try {
        const key='autoreply_chunk_recovered';
        const last=Number(sessionStorage.getItem(key)||0);
        if(Date.now()-last>120000){
          sessionStorage.setItem(key,String(Date.now()));
          const u=new URL(window.location.href);
          u.searchParams.set('app_refresh',String(Date.now()));
          window.location.replace(u.toString());
        }
      } catch { /* Session storage is disabled; retain the manual reload option. */ }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#F9F6FE] flex items-center justify-center p-6 text-slate-900 font-sans">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 mx-auto flex items-center justify-center shadow-md shadow-red-500/15">
              <AlertTriangle className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-950 tracking-tight">
                Auto Replies Dashboard
              </h2>
              <p className="text-sm font-semibold text-slate-600">
                A rendering issue was detected. Click reload to refresh the dashboard instantly.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left overflow-x-auto max-h-32 text-xs font-mono text-slate-700">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex items-center gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-5 py-3 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Try Again</span>
              </button>
              <button
                onClick={this.handleReload}
                className="bg-[#3B5BFF] hover:bg-indigo-700 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload App</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
