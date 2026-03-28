export function createRouter({ routes, store, mount }) {
  const routeMap = new Map(routes.map((route) => [route.id, route]));

  function getRoute(routeId) {
    return routeMap.get(routeId) ?? routes[0];
  }

  function renderRoute(routeId) {
    const route = getRoute(routeId);
    store.setState({ activeRoute: route.id });
    mount(route);
  }

  function handleHashChange() {
    const requestedId = window.location.hash.replace("#", "") || store.getState().activeRoute;
    renderRoute(requestedId);
  }

  return {
    start() {
      window.addEventListener("hashchange", handleHashChange);
      handleHashChange();
    }
  };
}
