const local = ['localhost', '127.0.0.1'].includes(location.hostname);
export const CONFIG = {
  apiBase: local ? 'http://127.0.0.1:8787' : 'https://one-step-planner-api.one-step-planner.workers.dev',
  appName: '오늘 한 걸음'
};
