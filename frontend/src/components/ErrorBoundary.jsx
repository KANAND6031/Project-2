import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[CodeInsight React Crash Caught]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-canvas, #090d16)',
            color: 'var(--text-primary, #f8fafc)',
            padding: '24px'
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface, #0f172a)',
              border: '1px solid var(--border-color, #1e293b)',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '600px',
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <AlertCircle size={24} style={{ color: 'var(--sev-crit, #ef4444)' }} />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Application Render Exception</h2>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #94a3b8)', marginBottom: '16px' }}>
              A client-side error occurred while rendering the dashboard.
            </p>
            <pre
              style={{
                backgroundColor: 'var(--bg-canvas, #090d16)',
                border: '1px solid var(--border-color, #1e293b)',
                borderRadius: '6px',
                padding: '12px 14px',
                fontSize: '0.78rem',
                color: 'var(--sev-crit, #ef4444)',
                overflowX: 'auto',
                marginBottom: '20px'
              }}
            >
              <code>{this.state.error?.message || String(this.state.error)}</code>
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
              >
                <RefreshCw size={14} />
                <span>Reload Application</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

