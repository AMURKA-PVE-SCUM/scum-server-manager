declare module 'srcds-rcon' {
  interface RconOptions {
    address: string;
    password: string;
  }

  interface RconClient {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    command(cmd: string): Promise<string>;
  }

  function createRcon(options: RconOptions): RconClient;

  export = createRcon;
}
