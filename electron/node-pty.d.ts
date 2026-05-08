declare module 'node-pty' {
  export interface IPty {
    onData(handler: (data: string) => void): void
    onExit(handler: (event: { exitCode: number; signal?: number }) => void): void
    write(data: string): void
    resize(cols: number, rows: number): void
    kill(signal?: string): void
    pid: number
    cols: number
    rows: number
  }

  export interface IProcessOptions {
    name?: string
    cols?: number
    rows?: number
    cwd?: string
    env?: Record<string, string>
  }

  export function spawn(file: string, args: string[], options: IProcessOptions): IPty
}
