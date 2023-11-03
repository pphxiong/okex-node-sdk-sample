import request from '@/utils/request';

const serverUrl = 'http://8.210.214.167:8092';
// const commonUrl = serverUrl;
const commonUrl = '/bn';

export async function getHistory(params) {
  return request(`${commonUrl}/swap/getHistory`, {
    params,
  });
}

export async function getLatestProfit(params) {
  return request(`${commonUrl}/swap/getLatestProfit`, {
    params,
  });
}

export async function setWinAndLossMax(params) {
  return request(`${commonUrl}/swap/setWinAndLossMax`, {
    params,
  });
}

export async function startHearBeat(params) {
  return request(`${commonUrl}/swap/startHearBeat`, {
    params,
  });
}

export async function reset(params) {
  return request(`${commonUrl}/swap/reset`, {
    params,
  });
}

export async function setRSIParams(params) {
  return request(`${commonUrl}/swap/setRSIParams`, {
    params,
  });
}

export async function setConditionParams(params) {
  return request(`${commonUrl}/swap/setConditionParams`, {
    params,
  });
}
