import request from '@/utils/request';

const commonUrl = '/okex';

export async function getFuturesLeverage(params) {
  return request(`${commonUrl}/futures/getLeverage`, {
    params,
  });
}

export async function postFuturesLeverage(params) {
  return request(`${commonUrl}/futures/postLeverage`, {
    params,
  });
}

export async function postFuturesOrder(params) {
  return request(`${commonUrl}/futures/postOrder`, {
    params,
  });
}

export async function postSwapLeverage(params) {
  return request(`${commonUrl}/swap/postLeverage`, {
    params,
  });
}

export async function postSwapOrder(params) {
  return request(`${commonUrl}/swap/postOrder`, {
    params,
  });
}

export async function getSwapAccount(params) {
  return request(`${commonUrl}/swap/getAccount`, {
    params,
  });
}

export async function getFuturesAccounts(params) {
  return request(`${commonUrl}/futures/getAccounts`, {
    params,
  });
}

export async function getFuturesMarkPrice(params) {
  return request(`${commonUrl}/futures/getMarkPrice`, {
    params,
  });
}

export async function getFuturesPosition(params) {
  return request(`${commonUrl}/futures/getPosition`, {
    params,
  });
}

export async function startMonitor(params) {
  return request(`${commonUrl}/operation/startMonitor`, {
    params,
  });
}

export async function stopMonitor(params) {
  return request(`${commonUrl}/operation/stopMonitor`, {
    params,
  });
}
