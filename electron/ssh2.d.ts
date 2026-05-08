declare module 'ssh2' {
  export class Client {
    constructor(opts?: any)
    connect(opts?: any): void
    on(event: string, callback: (...args: any[]) => void): this
    end(): void
    shell(options: any, callback: (err: any, stream: any) => void): void
    shell(callback: (err: any, stream: any) => void): void
    exec(command: string, callback: (err: any, stream: any) => void): void
    sftp(callback: (err: any, sftp: any) => void): void
  }
}
