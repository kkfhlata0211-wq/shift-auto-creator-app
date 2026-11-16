declare module 'sql.js' {
  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface Database {
    run(sql: string, params?: any[] | Record<string, any>): Database;
    exec(sql: string, params?: any[] | Record<string, any>): QueryExecResult[];
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Uint8Array | null) => Database;
  }

  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
}
