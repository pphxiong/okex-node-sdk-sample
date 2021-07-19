import request from '@/utils/request';

const commonUrl = '/okexSwapSimulation';

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
