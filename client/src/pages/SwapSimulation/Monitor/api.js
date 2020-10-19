import request from '@/utils/request';

const commonUrl = '/okexSwapSimulation';

export async function getWallet(params) {
  return request(`${commonUrl}/account/getCurrencies`, {
    params,
  });
}

export async function getOrders(params) {
  return request(`${commonUrl}/swap/getOrders`, {
    params,
  });
}

export async function getSwapInformation(params) {
  return request(`${commonUrl}/swap/information`, {
    params,
  });
}

export async function getSwapInformationSentiment(params) {
  return request(`${commonUrl}/swap/information/sentiment`, {
    params,
  });
}

export async function getTradeFee(params) {
  return request(`${commonUrl}/swap/getTradeFee`, {
    params,
  });
}

export async function getHistory(params) {
  return request(`${commonUrl}/swap/getHistory`, {
    params,
  });
}

export async function getSwapPosition(params) {
  return request(`${commonUrl}/swap/getPosition`, {
    params,
  });
}

export async function testOrderApi(params) {
  return request(`${commonUrl}/swap/testOrder`, {
    params,
  });
}

export async function testOrderMultiApi(params) {
  return request(`${commonUrl}/swap/testOrderMulti`, {
    params,
  });
}

export async function getMultiStatus(params) {
  return request(`${commonUrl}/swap/getMultiStatus`, {
    params,
  });
}
