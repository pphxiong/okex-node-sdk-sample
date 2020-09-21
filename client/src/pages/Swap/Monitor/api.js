import request from '@/utils/request';

const commonUrl = '/okexSwap';

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
