import request from '@/utils/request';

const commonUrl = '/okexSwap';

export async function getSwapLeverage(params) {
  return request(`${commonUrl}/futures/getLeverage`, {
    params,
  });
}

export async function postSwapLeverage(params) {
  return request(`${commonUrl}/futures/postLeverage`, {
    params,
  });
}

export async function postSwapOrder(params) {
  return request(`${commonUrl}/futures/postOrder`, {
    params,
  });
}

export async function getSwapAccount(params) {
  return request(`${commonUrl}/swap/getAccount`, {
    params,
  });
}

export async function getSwapAccounts(params) {
  return request(`${commonUrl}/futures/getAccounts`, {
    params,
  });
}

export async function getSwapMarkPrice(params) {
  return request(`${commonUrl}/futures/getMarkPrice`, {
    params,
  });
}

export async function getSwapPosition(params) {
  return request(`${commonUrl}/futures/getPosition`, {
    params,
  });
}

export async function autoCloseOrderByInstrumentId(params) {
  return request(`${commonUrl}/futures/autoCloseOrderByInstrumentId`, {
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

export async function changeMode(params) {
  return request(`${commonUrl}/operation/changeMode`, {
    params,
  });
}

export async function setFrequencyApi(params) {
  return request(`${commonUrl}/operation/setFrequency`, {
    params,
  });
}
