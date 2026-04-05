// 错误追踪和记录系统

interface ErrorRecord {
  timestamp: string;
  component: string;
  error: string;
  stackTrace?: string;
  context?: any;
  frequency: number;
  fixed: boolean;
  fixNote?: string;
}

class ErrorTracker {
  private static instance: ErrorTracker;
  private errors: Map<string, ErrorRecord> = new Map();
  private maxRecords = 100;

  private constructor() {
    this.loadFromStorage();
  }

  static getInstance(): ErrorTracker {
    if (!ErrorTracker.instance) {
      ErrorTracker.instance = new ErrorTracker();
    }
    return ErrorTracker.instance;
  }

  recordError(component: string, error: Error | string, context?: any) {
    const errorKey = `${component}-${error}`;
    const timestamp = new Date().toISOString();

    let errorRecord = this.errors.get(errorKey);

    if (errorRecord) {
      errorRecord.frequency++;
      errorRecord.timestamp = timestamp;
    } else {
      errorRecord = {
        timestamp,
        component,
        error: error instanceof Error ? error.message : error,
        stackTrace: error instanceof Error ? error.stack : undefined,
        context,
        frequency: 1,
        fixed: false,
      };
    }

    this.errors.set(errorKey, errorRecord);
    this.saveToStorage();

    console.log(`[ErrorTracker] Error recorded in ${component}:`, {
      error: errorRecord.error,
      frequency: errorRecord.frequency,
      context,
    });
  }

  markErrorFixed(errorKey: string, fixNote?: string) {
    const error = this.errors.get(errorKey);
    if (error) {
      error.fixed = true;
      error.fixNote = fixNote;
      this.saveToStorage();
      console.log(`[ErrorTracker] Error marked as fixed: ${errorKey}`);
    }
  }

  getAllErrors(): ErrorRecord[] {
    return Array.from(this.errors.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  getCommonErrors(limit: number = 10): ErrorRecord[] {
    return Array.from(this.errors.values())
      .filter(error => !error.fixed)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  getComponentErrors(component: string): ErrorRecord[] {
    return Array.from(this.errors.values())
      .filter(error => error.component === component);
  }

  cleanup() {
    const errors = Array.from(this.errors.values());
    const recentErrors = errors
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, this.maxRecords);

    this.errors.clear();
    recentErrors.forEach(error => {
      const key = `${error.component}-${error.error}`;
      this.errors.set(key, error);
    });

    this.saveToStorage();
  }

  exportReport(): string {
    const errors = this.getAllErrors();
    const commonErrors = this.getCommonErrors();

    let report = `# 错误追踪报告\n\n`;
    report += `生成时间: ${new Date().toISOString()}\n`;
    report += `总错误数: ${errors.length}\n`;
    report += `未修复错误: ${commonErrors.length}\n\n`;

    report += `## 常见错误\n\n`;
    commonErrors.forEach((error, index) => {
      report += `${index + 1}. **${error.component}** (${error.frequency}次)\n`;
      report += `   错误: ${error.error}\n`;
      if (error.context) {
        report += `   上下文: ${JSON.stringify(error.context, null, 2)}\n`;
      }
      report += `\n`;
    });

    report += `## 所有错误\n\n`;
    errors.forEach((error, index) => {
      report += `${index + 1}. [${error.fixed ? '✅' : '❌'}] **${error.component}**\n`;
      report += `   时间: ${new Date(error.timestamp).toLocaleString()}\n`;
      report += `   错误: ${error.error}\n`;
      report += `   频率: ${error.frequency}\n`;
      if (error.fixNote) {
        report += `   修复: ${error.fixNote}\n`;
      }
      report += `\n`;
    });

    return report;
  }

  private saveToStorage() {
    try {
      const data = {
        errors: Array.from(this.errors.entries()),
        version: '1.0',
      };
      localStorage.setItem('error-tracking', JSON.stringify(data));
    } catch (error) {
      console.error('[ErrorTracker] Failed to save to localStorage:', error);
    }
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem('error-tracking');
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.errors) {
          this.errors = new Map(parsed.errors);
        }
      }
    } catch (error) {
      console.error('[ErrorTracker] Failed to load from localStorage:', error);
    }
  }
}

export const errorTracker = ErrorTracker.getInstance();

// 添加到全局作用域
if (typeof window !== 'undefined') {
  window.errorTracker = errorTracker;
}

// 便捷的错误记录 hook
export function useErrorHandler(componentName: string) {
  return useCallback((error: Error | string, context?: any) => {
    errorTracker.recordError(componentName, error, context);
  }, [componentName]);
}