export interface Logger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
  debug(message: string, meta?: any): void;
}

class ConsoleLogger implements Logger {
  info(message: string, meta?: any): void {
    console.log(`[INFO] ${message}`, meta || '');
  }

  warn(message: string, meta?: any): void {
    console.warn(`[WARN] ${message}`, meta || '');
  }

  error(message: string, error?: Error, meta?: any): void {
    console.error(`[ERROR] ${message}`, error || '', meta || '');
  }

  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, meta || '');
    }
  }
}

export const logger: Logger = new ConsoleLogger();

