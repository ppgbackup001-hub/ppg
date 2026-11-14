import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Surface } from './ui';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Aura Audio error boundary caught:', error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-background text-foreground flex items-center justify-center p-6">
          <Surface className="max-w-md w-full p-6 border border-border">
            <h1 className="text-lg font-semibold mb-2">ไม่สามารถแสดงผลหน้านี้ได้ชั่วคราว</h1>
            <p role="alert" className="text-sm text-muted mb-5">
              {this.state.errorMessage}
            </p>
            <Button tone="ink" onClick={() => window.location.reload()}>
              โหลดหน้าแอพใหม่
            </Button>
          </Surface>
        </div>
      );
    }

    return this.props.children;
  }
}
