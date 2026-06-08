// Callable Firebase Functions wrapper for server-authoritative economy.

class EconomyApi {
  constructor() {
    this._functions = null;
  }

  getFunctions() {
    if (this._functions) return this._functions;
    if (typeof firebase === 'undefined' || !firebase.app) return null;
    try {
      if (!firebase.functions) return null;
      const f = firebase.functions();
      const useLocalEmulator = typeof window !== 'undefined'
        && window.location
        && (
          window.location.search.includes('functionsEmulator=1')
          || localStorage.getItem('blockBattleUseFunctionsEmulator') === '1'
        );
      if (useLocalEmulator) {
        try { f.useEmulator('localhost', 5001); } catch (e) { /* already connected */ }
      }
      this._functions = f;
      return f;
    } catch (err) {
      console.warn('Firebase Functions init failed:', err);
      return null;
    }
  }

  isAvailable() {
    return !!this.getFunctions();
  }

  async call(name, data) {
    const f = this.getFunctions();
    if (!f) throw new Error('functions-unavailable');
    const fn = f.httpsCallable(name);
    const result = await fn(data || {});
    return result.data;
  }
}

const economyApi = new EconomyApi();
