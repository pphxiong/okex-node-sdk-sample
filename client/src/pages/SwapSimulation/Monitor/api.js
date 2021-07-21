import request from '@/utils/request';

const serverUrl = 'http://8.210.214.167:8092';
// const commonUrl = serverUrl;
const commonUrl = '';

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
