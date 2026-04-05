'use client';

import React, { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: undefined,
      errorInfo: undefined,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误到追踪系统
    if (typeof window !== 'undefined' && window.errorTracker) {
      window.errorTracker.recordError(
        this.props.componentName || 'UnknownComponent',
        error,
        {
          errorInfo,
          componentStack: errorInfo.componentStack,
        }
      );
    } else {
      console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <div className="text-center">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-red-600 mb-2">
              组件出现错误
            </h2>
            <p className="text-gray-600 mb-4">
              {this.props.componentName || '组件'}遇到了一些问题
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// 添加到全局作用域以供其他组件使用
if (typeof window !== 'undefined') {
  window.ErrorBoundary = ErrorBoundary;
}