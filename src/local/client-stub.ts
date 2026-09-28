// Test build only: replaces @appdeploy/client, which needs the AppDeploy host.
export const auth = {
  getUser: async () => null,
  signIn: async () => ({ user: null }),
  signOut: async () => undefined,
};
export const api = {
  get: async () => {
    throw new Error('Сервер недоступен в тестовой версии');
  },
  post: async () => {
    throw new Error('Сервер недоступен в тестовой версии');
  },
};
