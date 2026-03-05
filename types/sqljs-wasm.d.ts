declare module 'sql.js/dist/sql-wasm.js' {
  type InitSqlJsOptions = {
    locateFile?: (file: string) => string;
    wasmBinary?: Uint8Array;
  };

  type SqlJsDatabase = {
    run: (sql: string, params?: any[]) => void;
    exec: (sql: string, params?: any[]) => Array<{ columns: string[]; values: any[][] }>;
    export: () => Uint8Array;
    close: () => void;
  };

  type SqlJsStatic = {
    Database: new (data?: Uint8Array) => SqlJsDatabase;
  };

  const initSqlJs: (options?: InitSqlJsOptions) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
