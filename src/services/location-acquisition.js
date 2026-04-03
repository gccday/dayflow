async function acquireLocationByInput(inputText, context = {}) {
  void inputText;
  void context;

  // TODO: 预留给后续的定位输入解析逻辑（当前按需求保持空实现）
  return null;
}

async function selectLocationFromCandidates(candidates, context = {}) {
  void candidates;
  void context;

  // TODO: 预留给后续的定位候选选择逻辑（当前按需求保持空实现）
  return null;
}

module.exports = {
  acquireLocationByInput,
  selectLocationFromCandidates
};
