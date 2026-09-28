// Local type stubs for checking outside AppDeploy (the platform supplies the real packages).
declare module '@appdeploy/client' {
  export const auth: {
    getUser(): Promise<unknown>;
    signIn(): Promise<{ user: unknown }>;
    signOut(): Promise<void>;
  };
  export const api: {
    get(path: string): Promise<{ data: any }>;
    post(path: string, body: unknown): Promise<{ data: any }>;
  };
}
declare module '@appdeploy/sdk' {
  export const db: any;
  export const error: any;
  export const json: any;
  export const requireAuth: any;
  export const router: any;
}
