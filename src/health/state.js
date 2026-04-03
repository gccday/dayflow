const state = {
  healthy: true,
  lastErrorAt: null,
  lastErrorMessage: null
};

function markError(errorLike) {
  const message =
    typeof errorLike === "string"
      ? errorLike
      : errorLike && errorLike.message
        ? String(errorLike.message)
        : String(errorLike || "unknown error");
  state.healthy = false;
  state.lastErrorAt = new Date().toISOString();
  state.lastErrorMessage = message;
}

function getState() {
  return {
    healthy: state.healthy,
    lastErrorAt: state.lastErrorAt,
    lastErrorMessage: state.lastErrorMessage
  };
}

function isHealthy() {
  return state.healthy;
}

module.exports = {
  markError,
  getState,
  isHealthy
};
