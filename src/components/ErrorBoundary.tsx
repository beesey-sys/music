import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      console.log("ErrorBoundary rendering fallback UI due to error:", this.state.error);
      return (
        <div className="min-h-screen bg-[#0a0502] text-white flex flex-col items-center justify-center p-8 text-center">
          <h1 className="text-4xl font-serif mb-4 text-[#ff4e00]">Something went wrong</h1>
          <p className="text-lg opacity-60 mb-8 max-w-md">
            The application encountered an unexpected error. This might be due to invalid saved data or a temporary issue.
          </p>
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl mb-8 max-w-2xl overflow-auto text-left font-mono text-xs">
            {this.state.error?.toString()}
          </div>
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="px-8 py-4 rounded-full bg-[#ff4e00] text-white font-bold uppercase tracking-widest hover:scale-105 transition-transform"
          >
            Clear Data & Restart
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
