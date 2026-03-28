export function createStore(initialState) {
  const listeners = new Set();
  let state = { ...initialState };

  return {
    getState() {
      return { ...state };
    },
    setState(nextState) {
      state = { ...state, ...nextState };
      listeners.forEach((listener) => listener(this.getState()));
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    }
  };
}
